/**
 * Czat: cztery zgłoszenia właściciela zmierzone na żywej stronie, na telefonie 390x844.
 *
 *     node tools/probe-chat-flows.mjs http://127.0.0.1:4173
 *
 * PO CO OSOBNA SONDA, KIEDY JEST `tools/probe-chat-ui.mjs`
 *   Tamta mierzy czat na oknie komputera, a klawiaturę telefonu UDAJE: podstawia `--screen-h`
 *   na 380 px i sprawdza, co z tego wynika w arkuszu. To sprawdza kaskadę, ale nie sprawdza
 *   ZGŁOSZENIA — bo na prawdziwym telefonie klawiatura NIE ZMIENIA `--screen-h`. Ta zmienna
 *   jest zamrożonym `100svh` (patrz `measureScreenHeight` w site-bridge.js) i taka ma zostać:
 *   od niej zależy wysokość czternastu sekcji i to ona naprawiła teleportowanie przy
 *   przewijaniu palcem. Klawiatura na Androidzie i w iOS skraca WYŁĄCZNIE `visualViewport` —
 *   `innerHeight` i `100svh` zostają tam, gdzie były.
 *
 *   Dlatego ta sonda mierzy okno 390x844 i otwiera klawiaturę tak, jak robi to telefon:
 *   skróceniem `visualViewport` o 400 px, z prawdziwym zdarzeniem `resize` na nim. Zaślepka
 *   jest wstawiana PRZED skryptami strony — inaczej czat zdążyłby podłączyć się do
 *   prawdziwego widoku i nie usłyszałby ani jednej zmiany.
 *
 * CO MIERZY (numery jak w zgłoszeniu)
 *   1. Pozycja przewinięcia dokumentu przed i po kliknięciu w KAŻDY klikalny element czatu —
 *      wyliczany z drzewa panelu, nie z listy selektorów, żeby nowy przycisk nie wypadł
 *      z pomiaru w chwili, w której go ktoś doda.
 *   2. Wskaźnik „automat pisze" w TRZECH ścieżkach: po wysłaniu wiadomości, po naciśnięciu
 *      pastylki (odpowiedź z pamięci strony) i przy odpowiedzi organizatora dociąganej
 *      odpytywaniem.
 *   3. Bąbelek gościa po naciśnięciu pastylki — i jego BRAK po wpisaniu sześciu cyfr kodu.
 *   5. Pasek pastylek i kompozytor przy otwartej klawiaturze: nad nią czy pod nią.
 *
 * Punkt 4 (trafność automatu i zatrzask przekazania) mieszka w Workerze i mierzy się go przy
 * żywym backendzie — `tools/probe-chat-live.mjs`. Tutaj nie ma czego mierzyć: serwer podglądu
 * nie ma Workera, a atrapa odpowiedziałaby dokładnie to, co się jej każe.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173';
/* Klawiatura zabiera na ekranie 844 px między 380 i 420 px razem z paskiem podpowiedzi.
   400 px to środek tego zakresu — i liczba, którą sonda wypisuje, żeby wynik dał się
   powtórzyć ręcznie na telefonie. */
const KEYBOARD_PX = 400;
const SCREEN = { width: 390, height: 844 };

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
/* ==========================================================================
   KLAWIATURA TELEFONU, CZYLI SKRÓCONY visualViewport
   ==========================================================================
   Ten blok stoi w zwykłym, nieodroczonym skrypcie, więc wykonuje się PRZED modułami strony.
   To jest cała sztuczka: czat podłącza się do window.visualViewport przy starcie, więc
   zaślepka wstawiona po nim byłaby obiektem, którego nikt nie słucha.

   Zaślepka nie kłamie o niczym poza wysokością: szerokość, przesunięcie i skala idą
   z prawdziwego widoku. Zdarzenia wysyłane są oba — resize i scroll — bo klawiatura w iOS
   wysyła jedno, w Androidzie drugie, a sonda wysyłająca tylko jedno przechodziłaby na
   kodzie, który słucha tego drugiego.
   ========================================================================== */
(() => {
  const state = { inset: 0 };
  const real = window.visualViewport || null;
  class FakeViewport extends EventTarget {
    get width() { return real ? real.width : window.innerWidth; }
    get height() { return (real ? real.height : window.innerHeight) - state.inset; }
    get offsetLeft() { return real ? real.offsetLeft : 0; }
    get offsetTop() { return real ? real.offsetTop : 0; }
    get pageLeft() { return real ? real.pageLeft : window.scrollX; }
    get pageTop() { return real ? real.pageTop : window.scrollY; }
    get scale() { return real ? real.scale : 1; }
    set onresize(fn) { if (fn) this.addEventListener('resize', fn); }
    set onscroll(fn) { if (fn) this.addEventListener('scroll', fn); }
  }
  const fake = new FakeViewport();
  try {
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__fakeViewport = true;
  } catch (_) {
    window.__fakeViewport = false;
  }
  window.__keyboard = (px) => {
    state.inset = Math.max(0, Number(px) || 0);
    fake.dispatchEvent(new Event('resize'));
    fake.dispatchEvent(new Event('scroll'));
  };
})();
</script>
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [], viewportFaked: window.__fakeViewport === true, keyboardPx: ${KEYBOARD_PX} };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));

  // Czyste wejście: bramka tożsamości ma stanąć, a wątek ma być nowy.
  try {
    localStorage.removeItem('carruleddhi.chat.name');
    localStorage.removeItem('carruleddhi.chat.email');
    localStorage.removeItem('carruleddhi.chatToken');
  } catch (_) {}

  await sleep(2600);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const T = (key) => String(window.CARRULEDDHI_API?.text(key) || '');
  const panel = document.querySelector('[data-chat]');
  const logText = () => String(document.querySelector('[data-chat-log]')?.textContent || '');
  const typing = () => Boolean(document.querySelector('.chat-typing'));
  const visitors = () => document.querySelectorAll('.chat-msg--visitor').length;
  const scrollNow = () => Math.round(window.scrollY);
  const focusName = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'BODY';
    return el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '');
  };
  const box = (selector) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (!r.height && !r.width) return null;
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
  };
  const writeInput = (value) => {
    const field = document.querySelector('[data-chat-input]');
    if (!field) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const say = async (message, settle) => {
    writeInput(message);
    document.querySelector('[data-chat-send]')?.click();
    await sleep(settle || 900);
  };
  const chipByKey = (key) => [...document.querySelectorAll('[data-chat-chips-list] .chat__chip')]
    .find((chip) => chip.textContent.trim() === T(key).trim());

  if (!panel) {
    out.errors.push('brak panelu czatu');
  } else {

  /* ATRAPA SERWERA — TRZYMAJĄCA STAN.
     ---------------------------------------------------------------------------
     Podgląd nie ma Workera, a bez odpowiedzi nie ma czego mierzyć: kropki gasną w finally,
     kreator się nie otwiera, a odczyt nie przynosi nic. Atrapa pamięta tryb wątku i to, czy
     organizator pisze — inaczej sonda mierzyłaby jej niekonsekwencję, nie zachowanie strony.
     Opóźnienie odpowiedzi jest nastawialne, bo bez niego kropki po wysłaniu żyją tyle, ile
     trwa odbicie od localhosta, czyli poniżej progu mierzalności. */
  const realFetch = window.fetch.bind(window);
  const stub = {
    sendDelay: 0, selfService: null, reply: 'Odpowiedź automatu.', mode: 'ai',
    theirTyping: false, pollMessages: [], sends: 0, polls: 0,
    /* Jednorazowa awaria wysyłki. Potrzebna, bo wiersz systemowy .chat__system jest
       czwartą drogą dopisania czegoś do dziennika i ma trafiać na jego dół tak samo jak
       trzy pozostałe — a najkrótszą pewną drogą do niego jest odpowiedź „ok: false". */
    failNext: false
  };
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    if (!url.includes('/api/carruleddhi/')) return realFetch(input, init);
    let payload = {};
    try { payload = JSON.parse(init?.body || '{}'); } catch (_) {}
    const answer = (data) => new Response(JSON.stringify({ ok: true, ...data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/verify-start')) return answer({ email: 'p***e@example.com' });
    if (url.includes('/verify-code')) return answer({ verified: true });
    if (url.includes('/sponsor-lead')) return answer({ received: true });
    if (payload.action === 'send') {
      stub.sends += 1;
      if (stub.sendDelay) await sleep(stub.sendDelay);
      if (stub.failNext) {
        stub.failNext = false;
        return new Response(JSON.stringify({ ok: false, code: 'chat' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return answer({
        mode: stub.mode,
        reply: stub.selfService ? null : stub.reply,
        ...(stub.selfService ? { selfService: stub.selfService } : {}),
        messageId: 'm' + stub.sends, messageAt: new Date().toISOString(),
        replyId: 'r' + stub.sends, replyAt: new Date().toISOString()
      });
    }
    if (payload.action === 'poll') {
      stub.polls += 1;
      const messages = stub.pollMessages;
      stub.pollMessages = [];
      return answer({ mode: stub.mode, messages, theirTyping: stub.theirTyping });
    }
    if (payload.action === 'bot') { stub.mode = 'ai'; return answer({ mode: 'ai' }); }
    return answer({ mode: stub.mode, messages: [], chatOpen: true });
  };

  document.getElementById('contact')?.scrollIntoView();
  await sleep(400);
  document.querySelector('[data-contact-tab="chat"]')?.click();
  await sleep(600);

  /* ======================================================================
     1. POZYCJA PRZEWINIĘCIA PRZY KAŻDYM KLIKNIĘCIU
     ======================================================================
     Lista klikalnych elementów jest WYLICZANA z drzewa panelu, nie wpisana. Sonda z listą
     selektorów przechodzi po dodaniu nowego przycisku, którego nikt nie zmierzył — a to jest
     dokładnie ten rodzaj przycisku, który przerzuca stronę na górę.

     Razem z pozycją zapisywany jest element z fokusem: fokus spadający na body (bo kliknięty
     przycisk został usunięty z drzewa albo zablokowany) zwija na telefonie klawiaturę, a to
     zmienia wysokość dokumentu złożonego z sekcji mierzonych od wysokości ekranu.
     ====================================================================== */
  out.clicks = [];
  const clickables = () => [...panel.querySelectorAll(
    'button, a[href], input, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'
  )].filter((el) => !el.hidden && !el.disabled && el.offsetParent !== null);

  const describe = (el) => {
    const key = Object.keys(el.dataset).find((name) => name.startsWith('chat'));
    const mark = key ? '[' + key + ']' : (el.id ? '#' + el.id : '');
    return (el.tagName.toLowerCase() + mark
      + (el.className ? '.' + String(el.className).split(' ')[0] : '')).slice(0, 48);
  };

  const clickAndMeasure = async (label, el, settle) => {
    if (!el) { out.clicks.push({ label, missing: true }); return; }
    window.scrollTo(0, Math.round(document.body.scrollHeight * 0.55));
    await sleep(260);
    const before = scrollNow();
    el.click();
    await sleep(90);
    const mid = scrollNow();
    const focus = focusName();
    await sleep(settle === undefined ? 640 : settle);
    out.clicks.push({ label, before, mid, after: scrollNow(), focus });
  };

  // Karta z imieniem i adresem to też część czatu: jej pola i przycisk są klikane pierwsze.
  for (const el of clickables()) await clickAndMeasure('brama: ' + describe(el), el, 260);

  const nameField = document.getElementById('chat-gate-name');
  const emailField = document.getElementById('chat-gate-email');
  if (nameField && emailField) {
    nameField.value = 'Marco';
    emailField.value = 'marco@example.com';
    document.querySelector('[data-chat-gate-form] button[type=submit]').click();
    await sleep(900);
  }
  out.entered = { ready: panel.dataset.chatReady || '', greeting: logText().length > 0 };

  /* Rozmowa otwarta: teraz klikalne jest wszystko poza kartą tożsamości. Kolejność jest
     wyliczana raz i zapamiętana, bo rząd pastylek jest przemalowywany po każdej odpowiedzi —
     iterowanie po żywej liście klikałoby w elementy zdjęte w poprzednim kroku. */
  const live = clickables();
  for (const el of live) {
    if (!el.isConnected || el.hidden) continue;
    const label = 'rozmowa: ' + describe(el);
    await clickAndMeasure(label, el);
    /* „Zakończ rozmowę" po pierwszym naciśnięciu jest zbrojony i drugie naciśnięcie kończy
       rozmowę. Odczekanie pięciu sekund rozbraja go samo — mierzymy klikalność, a nie
       zamknięcie wątku, które ma swój własny pomiar niżej. */
    if (el.dataset.chatEnd !== undefined) await sleep(5200);
  }

  /* Po przejściu po wszystkim rozmowa mogła zostać zamknięta albo zaczęta od nowa — wracamy
     do stanu „rozmowa trwa", bo dalsze pomiary są o rozmowie, nie o panelu. */
  if (panel.dataset.chatReady !== 'yes') {
    document.querySelector('[data-chat-restart]')?.click();
    await sleep(500);
    const again = document.getElementById('chat-gate-name');
    const mail = document.getElementById('chat-gate-email');
    if (again && mail) {
      again.value = 'Marco';
      mail.value = 'marco@example.com';
      document.querySelector('[data-chat-gate-form] button[type=submit]').click();
      await sleep(900);
    }
  }

  /* ======================================================================
     2a. KROPKI PO WYSŁANIU WIADOMOŚCI
     ======================================================================
     Odpowiedź atrapy opóźniona o 800 ms, bo na localhoście bez tego wraca w kilka
     milisekund — a wtedy „kropki były" i „kropek nie było" wyglądają w pomiarze tak samo.
     Odczyt natychmiast po kliknięciu, bo wskaźnik ma stanąć w TYM SAMYM zadaniu co
     naciśnięcie: patrz komentarz o "flow &&" przed "await" w send() w app.js.
     ====================================================================== */
  stub.sendDelay = 800;
  writeInput('Ile kosztuje zapisanie wozka?');
  document.querySelector('[data-chat-send]')?.click();
  const sendAtClick = typing();
  await sleep(300);
  const sendDuring = typing();
  await sleep(1400);
  out.typingSend = { atClick: sendAtClick, during: sendDuring, after: typing(),
    reply: logText().includes('Odpowiedź automatu') };
  stub.sendDelay = 0;

  /* ======================================================================
     2b. i 3. KROPKI ORAZ BĄBELEK PO NACIŚNIĘCIU PASTYLKI
     ======================================================================
     Kreator odpowiada Z PAMIĘCI STRONY, więc bez kolejki jego zdania stawały na ekranie
     w tej samej milisekundzie, w której gość kliknął. Odczyt po 60 ms, nie natychmiast:
     kolejka jest obietnicą, więc kropki wchodzą w następnym zadaniu mikrokolejki, a przed
     upływem THINK_MS (280 ms w app.js) mają jeszcze stać.
     ====================================================================== */
  stub.selfService = 'sponsor';
  await say('Chcialbym zostac sponsorem Carruleddhi Show.', 1100);
  stub.selfService = null;

  const yes = chipByKey('chat.sponsorYes');
  if (!yes) {
    out.errors.push('kreator sponsora sie nie otworzyl');
  } else {
    const before = visitors();
    const label = yes.textContent.trim();
    const scrollBefore = scrollNow();
    yes.click();
    await sleep(60);
    out.pill = {
      typingShown: typing(),
      bubbleAdded: visitors() - before,
      bubbleText: (() => {
        const all = document.querySelectorAll('.chat-msg--visitor .chat-msg__body');
        return all.length ? all[all.length - 1].textContent.trim() : '';
      })(),
      label,
      scrollBefore
    };
    await sleep(1000);
    out.pill.typingGone = !typing();
    out.pill.answered = logText().includes(T('chat.sponsorAskName').slice(0, 24));
    out.pill.scrollAfter = scrollNow();
  }

  /* ======================================================================
     3. KOD: POLE JEST, BĄBELKA NIE MA
     ======================================================================
     Do bramki wchodzi się przez całą sprawę sponsora, bo tak wchodzi w nią człowiek: nazwa,
     zgoda, imię i nazwisko, pominięty telefon, adres. Sześć cyfr nie ma prawa zostawić po
     sobie ani bąbelka, ani wiersza w wątku — kod do cudzej skrzynki w historii czytanej przez
     organizatora to kod w miejscu, w którym nie ma prawa być.
     ====================================================================== */
  await say('Trattoria Probe');

  /* Zgoda nie ma już pastylki „Zgadzam się": pada po przewinięciu dokumentu do końca w tym
     samym oknie, którego używa formularz zapisu. Pętla, bo treść dociąga się osobnym żądaniem
     i pierwsze przewinięcie trafia czasem w pustą jeszcze ramkę. */
  chipByKey('chat.sponsorConsentRead')?.click();
  await sleep(500);
  for (let round = 0; round < 14; round += 1) {
    const scroller = document.querySelector('[data-consent-scroll]');
    const accept = document.querySelector('[data-consent-accept]');
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll'));
    }
    if (accept && !accept.disabled) break;
    await sleep(200);
  }
  document.querySelector('[data-consent-accept]')?.click();
  await sleep(1100);

  /* ======================================================================
     6. CYFRA W IMIENIU I NAZWISKU — BŁĄD OD PIERWSZEGO ZNAKU
     ======================================================================
     Mierzone w dwóch miejscach, bo obietnica jest podwójna: ostrzeżenie ma STANĄĆ NA EKRANIE
     przy wpisanej cyfrze (nie po wysłaniu, nie po zejściu z pola), a wysłanie takiej odpowiedzi
     ma się odbić od kreatora. Sonda sprawdza też, że ostrzeżenie SCHODZI, gdy cyfry nie ma —
     komunikat, który zostaje na zawsze, jest gorszy od braku komunikatu.
     ====================================================================== */
  const warnRow = () => document.querySelector('[data-chat-warn]');
  writeInput('Mario2');
  await sleep(220);
  out.nameDigit = {
    expected: T('chat.sponsorNoDigits').trim(),
    liveShown: Boolean(warnRow()) && warnRow().hidden === false,
    liveText: String(warnRow()?.textContent || '').trim()
  };
  writeInput('Mario');
  await sleep(220);
  out.nameDigit.liveGone = warnRow()?.hidden === true;

  await say('Mario2 Rossi', 1100);
  out.nameDigit.refused = logText().includes(T('chat.sponsorNoDigits'));
  out.nameDigit.stillPerson = !logText().includes(T('chat.sponsorAskPhone'));

  await say('Mario Rossi', 1100);
  out.nameDigit.acceptedClean = logText().includes(T('chat.sponsorAskPhone'));

  /* ======================================================================
     7. DWA KROKI OPCJONALNE: ZDJĘCIE I ODSYŁACZ
     ======================================================================
     Telefon podany, zdjęcie pominięte pastylką, odsyłacz najpierw wpisany BŁĘDNIE (bez
     "https://") i dopiero potem pominięty. Trzy rzeczy naraz: że pominięcie zdjęcia prowadzi
     do pytania o odsyłacz, że odsyłacz bez "https://" odbija się z komunikatem, i że
     pominięcie obu prowadzi do podsumowania — czyli że najczęstsza droga przez ten kreator
     („nie mam logo pod ręką") nie kończy się w ślepej uliczce.
     ====================================================================== */
  await say('+39 328 111 2233', 1100);
  out.optional = { logoAsked: logText().includes(T('chat.sponsorAskLogo')) };
  chipByKey('chat.sponsorLogoSkip')?.click();
  await sleep(900);
  out.optional.linkAsked = logText().includes(T('chat.sponsorAskLink'));
  await say('trattoria-probe.it', 1100);
  out.optional.badLinkRefused = logText().includes(T('chat.sponsorBadLink'));
  out.optional.notFixedForUs = !logText().includes('https://trattoria-probe.it');
  chipByKey('chat.sponsorLinkSkip')?.click();
  await sleep(900);
  out.optional.emailAsked = logText().includes(T('chat.sponsorAskEmail'));

  await say('probe@example.com', 1300);

  /* ======================================================================
     8. PODSUMOWANIE I POTWIERDZENIE
     ======================================================================
     Czytany OSTATNI blok podsumowania w dzienniku, nie pierwszy: po „nie, popraw" stoją tam
     dwa, a pytanie brzmi „co widzi gość teraz".
     ====================================================================== */
  const summaryText = () => {
    const all = document.querySelectorAll('[data-chat-summary]');
    return all.length ? String(all[all.length - 1].textContent || '') : '';
  };
  const chipLabels = () => [...document.querySelectorAll('[data-chat-chips-list] .chat__chip')]
    .map((chip) => chip.textContent.trim());

  out.summary = {
    shown: Boolean(document.querySelector('[data-chat-summary]')),
    gateBefore: Boolean(document.querySelector('[data-chat-code]')),
    cart: summaryText().includes('Trattoria Probe'),
    person: summaryText().includes('Mario Rossi'),
    phone: summaryText().includes('2233'),
    email: summaryText().includes('probe@example.com'),
    /* Liczone przez podział, nie wyrażeniem regularnym: napis ze słownika bywa w innym języku
       i wolno mu zawierać kropkę albo nawias, czyli znaki, które w wyrażeniu znaczą co innego. */
    skipped: summaryText().split(T('chat.sponsorSummaryNone')).length - 1,
    chips: chipLabels()
  };

  /* „Nie, popraw" poprawia JEDNO pole i wraca do podsumowania z resztą nietkniętą. Poprawiany
     jest telefon, bo jest polem opcjonalnym w środku kolejki — gdyby menu poprawek wracało do
     początku kreatora, zgubiłoby nazwę i osobę przed nim ORAZ adres po nim. */
  chipByKey('chat.sponsorSummaryFix')?.click();
  await sleep(900);
  out.fix = { asked: logText().includes(T('chat.sponsorFixWhich')), menu: chipLabels() };
  chipByKey('chat.sponsorSummaryPhone')?.click();
  await sleep(900);
  await say('+39 328 999 8877', 1300);
  out.fix.backToSummary = document.querySelectorAll('[data-chat-summary]').length === 2;
  out.fix.keptCart = summaryText().includes('Trattoria Probe');
  out.fix.keptPerson = summaryText().includes('Mario Rossi');
  out.fix.keptEmail = summaryText().includes('probe@example.com');
  out.fix.newPhone = summaryText().includes('8877');
  out.fix.oldPhoneGone = !summaryText().includes('2233');

  chipByKey('chat.sponsorSummaryYes')?.click();
  await sleep(1300);

  const codeInput = document.querySelector('[data-chat-code]');
  out.code = { fieldThere: Boolean(codeInput) };
  if (codeInput) {
    const before = visitors();
    codeInput.value = '123456';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1200);
    out.code.bubblesDelta = visitors() - before;
    out.code.codeInLog = logText().includes('123456');
  }

  /* ======================================================================
     2c. KROPKI PRZY ODPOWIEDZI ORGANIZATORA DOCIĄGANEJ ODPYTYWANIEM
     ======================================================================
     Trzecia ścieżka: nikt nic nie wysyła, a odpowiedź powstaje po drugiej stronie. Odczyt
     chodzi co CHAT_POLL_MS (4 s), więc jeden cykl trzeba przeczekać — inaczej mierzy się
     stan sprzed pierwszego odczytu.
     ====================================================================== */
  stub.mode = 'human';
  stub.theirTyping = true;
  await sleep(4800);
  out.typingPoll = { whileTyping: typing() };
  stub.theirTyping = false;
  stub.pollMessages = [{ id: 'org-1', author: 'organiser', body: 'Jestem, juz sprawdzam.',
    at: new Date().toISOString() }];
  await sleep(4800);
  out.typingPoll.afterAnswer = typing();
  out.typingPoll.answerShown = logText().includes('Jestem, juz sprawdzam');
  stub.mode = 'ai';

  /* ======================================================================
     5. KLAWIATURA NA TELEFONIE: PASEK NAD POLEM ZOSTAJE NAD KLAWIATURĄ
     ======================================================================
     Mierzone dwa razy: przy zamkniętej i przy otwartej klawiaturze, i porównywane z DOLNĄ
     KRAWĘDZIĄ WIDOCZNEGO OBSZARU (visualViewport.offsetTop + visualViewport.height), a nie
     z wysokością okna. To jest różnica między „jest na stronie" i „widać to" — a zgłoszenie
     brzmiało „pastylka nad polem zostaje w złym miejscu", czyli: jest, tylko pod klawiaturą.
     ====================================================================== */
  const shot = (label) => {
    const view = window.visualViewport;
    const visibleBottom = Math.round((view ? view.offsetTop : 0) + (view ? view.height : window.innerHeight));
    const chips = box('[data-chat-chips]');
    const composer = box('[data-chat-form]');
    const send = box('[data-chat-send]');
    const logBox = box('[data-chat-log]');
    const noteBox = box('[data-chat-note]');
    const root = getComputedStyle(document.documentElement);
    return {
      label,
      /* Od góry dziennika do dołu KOMPOZYTORA, nie do dołu notki. Notka jest napisem
         objaśniającym, w który nikt nie klika; przy otwartej klawiaturze wolno jej zostać
         pod nią. Obietnica dotyczy tego, czym się rozmawia: dziennika, podpowiedzi
         i kompozytora z przyciskiem wysyłki. */
      chatSpan: (logBox && composer) ? composer.bottom - logBox.top : -1,
      note: noteBox,
      screenH: root.getPropertyValue('--screen-h').trim(),
      chatVh: root.getPropertyValue('--chat-vh').trim(),
      viewportH: Math.round(view ? view.height : window.innerHeight),
      innerH: window.innerHeight,
      visibleBottom,
      log: logBox,
      chips,
      composer,
      send,
      logCap: getComputedStyle(document.querySelector('[data-chat-log]')).maxHeight,
      inputCap: getComputedStyle(document.querySelector('[data-chat-input]')).maxHeight,
      chipsBelow: chips ? chips.bottom - visibleBottom : null,
      composerBelow: composer ? composer.bottom - visibleBottom : null,
      /* POZYCJA PRZEWINIĘCIA DOKUMENTU I JEGO WYSOKOŚĆ, W KAŻDYM UJĘCIU.
         ---------------------------------------------------------------------------
         Bez tych trzech liczb sonda nie widzi zgłoszenia „dotknięcie pola przerzuca stronę
         na górę". Mechanizm jest cichy: klawiatura skraca --chat-vh, arkusz skraca sufit
         dziennika, dokument robi się NIŻSZY, a przeglądarka przycina przewinięcie do nowego
         maksimum. Wysokość wraca po zwinięciu klawiatury, przewinięcie NIE — bo nikt go nie
         przywraca, a zdarzenie resize na oknie (na którym stoi bezpiecznik w index.html)
         przy interactive-widget=resizes-visual w ogóle nie leci. Widać to tylko wtedy, gdy
         mierzy się scrollY RAZEM z scrollHeight. */
      docY: Math.round(window.scrollY),
      docH: Math.round(document.documentElement.scrollHeight),
      docMax: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
      focus: focusName()
    };
  };

  /* Rozmowa najpierw ustawiona tak, jak ją widzi ktoś, kto zaraz zacznie pisać: kompozytor
     w widocznym obszarze, palec w polu. Pomiar zrobiony z rozmowy stojącej cztery tysiące
     pikseli niżej mierzyłby pozycję przewinięcia, nie klawiaturę. */
  document.querySelector('[data-chat-chips]')?.classList.remove('is-open');
  document.querySelector('[data-chat-form]')?.scrollIntoView({ block: 'center' });
  await sleep(700);
  /* Ujęcie ZERO: stan przed dotknięciem pola, z PUSTYM polem. To jest liczba, do której
     porównuje się wszystkie następne — zgłoszenie brzmi „dotknięcie pola przerzuca stronę
     na górę", więc bez pomiaru sprzed dotknięcia nie ma czego porównywać. Puste pole, bo
     to jest też stan, w którym mierzy się WYSOKOŚĆ czatu ze zgłoszenia numer dwa: dziennik
     przy pustym kompozytorze. */
  out.keyboardBefore = shot('przed dotknieciem pola, pole puste');

  writeInput('Chcialbym zapytac o kask, o numer startowy i o to, czy moge zapisac sie z kolega '
    + 'oraz czy wozek musi miec hamulec z linka, bo buduje go z tata w garazu.');
  await sleep(300);

  /* focus() BEZ preventScroll, i to jest celowe.
     ---------------------------------------------------------------------------
     Reszta strony woła focus({ preventScroll: true }), bo tam fokus przekłada KOD.
     Tu fokus zakłada PALEC — a palec nie ma flagi. Pole jest w tej chwili całe w kadrze
     (kompozytor przewinięty na środek widoku wyżej), więc przeglądarka nie ma powodu
     niczego przewijać; jeśli przewinie, to jest dokładnie ta usterka, którą mierzymy.
     preventScroll w tym miejscu ukrywałby ją przed sondą. */
  document.querySelector('[data-chat-input]')?.focus();
  await sleep(400);
  out.keyboardClosed = shot('klawiatura zamknieta');

  window.__keyboard(${KEYBOARD_PX});
  await sleep(700);
  out.keyboardOpen = shot('klawiatura otwarta');

  window.__keyboard(0);
  await sleep(400);
  out.keyboardBack = shot('klawiatura zwinieta');
  writeInput('');

  /* ======================================================================
     9. PO DOPISANIU WIADOMOŚCI DZIENNIK STOI NA JEJ DOLE
     ======================================================================
     Przewijany jest WYŁĄCZNIE .chat__log, czyli element z własnym overflow-y: auto.
     Przewinięcie dokumentu byłoby dokładnie tą usterką z punktu 1, więc pozycja dokumentu
     jest tu mierzona razem z pozycją dziennika — „ostatnia wiadomość na dole" osiągnięte
     przewinięciem strony nie jest naprawą, jest zamianą jednej usterki na drugą.

     Mierzone trzy stany, bo obietnica ma trzy części:
       a) po wysłaniu własnej wiadomości dziennik stoi na dole,
       b) po ręcznym przewinięciu w górę i wiadomości OD ORGANIZATORA widok NIE skacze,
       c) po wysłaniu własnej wiadomości z pozycji „przewinięty w górę" — skacze, bo to
          właściciel widoku właśnie coś napisał i chce to zobaczyć.
     ====================================================================== */
  const logEl = document.querySelector('[data-chat-log]');
  /** Ile pikseli brakuje dziennikowi do dołu. Zero znaczy „stoi na ostatniej wiadomości". */
  const logGap = () => (logEl
    ? Math.round(logEl.scrollHeight - logEl.clientHeight - logEl.scrollTop)
    : -1);
  const scrollUpInLog = async () => {
    if (!logEl) return;
    logEl.scrollTop = 0;
    logEl.dispatchEvent(new Event('scroll'));
    await sleep(260);
  };

  stub.mode = 'ai';
  stub.reply = 'Odpowiedz o kasku.';
  out.stick = {
    /* Dziennik musi mieć co przewijać: pudełko krótsze od treści. Bez tego wszystkie trzy
       pomiary dawałyby zero i sonda przechodziłaby na czacie, który nic nie przewija. */
    scrollable: logEl ? logEl.scrollHeight - logEl.clientHeight > 80 : false,
    docYBefore: Math.round(window.scrollY)
  };

  await scrollUpInLog();
  out.stick.gapScrolledUp = logGap();
  await say('Czy kask musi miec homologacje?', 1500);
  out.stick.gapAfterOwnSend = logGap();
  out.stick.docYAfterOwnSend = Math.round(window.scrollY);

  await scrollUpInLog();
  out.stick.gapBeforeOrganiser = logGap();
  stub.mode = 'human';
  stub.pollMessages = [{ id: 'org-2', author: 'organiser',
    body: 'Dopisuje sie do watku, sprawdzam liste.', at: new Date().toISOString() }];
  await sleep(4800);
  out.stick.gapAfterOrganiser = logGap();
  out.stick.organiserShown = logText().includes('Dopisuje sie do watku');
  out.stick.docYAfterOrganiser = Math.round(window.scrollY);

  /* Wiersz systemowy: czwarta droga do dziennika, obok bąbelka gościa, automatu
     i organizatora. Wywoływany najkrótszą pewną drogą — nieudaną wysyłką, po której czat
     dopisuje .chat__system z „nie udało się wysłać". Gdyby ta droga miała własne,
     osobne przewijanie (albo nie miała żadnego), zdanie o błędzie stawałoby poniżej
     widocznego dołu: gość widziałby wiadomość, która po prostu nic nie zrobiła. */
  stub.mode = 'ai';
  stub.pollMessages = [];
  stub.failNext = true;
  await say('Wiadomosc, ktora nie dojdzie.', 1600);
  out.stick.gapAfterSystem = logGap();
  out.stick.systemShown = Boolean(document.querySelector('.chat__system'));
  out.stick.docYAfterSystem = Math.round(window.scrollY);

  /* Na koniec dwa naciśnięcia, których wcześniej celowo nie dokończyliśmy: potwierdzenie
     zakończenia rozmowy i „nowa rozmowa". Oba zmieniają całą zawartość panelu, więc są
     najlepszym testem tego, czy strona przy takiej zmianie nie drgnie. */
  const end = document.querySelector('[data-chat-end]');
  if (end) {
    await clickAndMeasure('koniec: zbrojenie', end, 200);
    await clickAndMeasure('koniec: potwierdzenie', end, 900);
  }
  await clickAndMeasure('koniec: nowa rozmowa', document.querySelector('[data-chat-restart]'), 900);
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-chatflows-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__chatflowsprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    `--window-size=${SCREEN.width},${SCREEN.height}`,
    /* Budżet czasu wirtualnego większy niż w pozostałych sondach z jednego powodu: dwie
       ścieżki pomiaru czekają na cykl odpytywania (4 s każda), a przejście po wszystkich
       klikalnych elementach to kilkadziesiąt osobnych pomiarów po niecałej sekundzie. */
    '--virtual-time-budget=180000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__chatflowsprobe.html?skipIntro=1`
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

  console.log(`ekran ${SCREEN.width}x${SCREEN.height}, klawiatura ${KEYBOARD_PX} px`);
  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);
  check(r.viewportFaked === true, 'zaślepka visualViewport weszła przed skryptami strony');
  check(r.entered?.ready === 'yes', `rozmowa otwarta po podaniu danych: "${r.entered?.ready}"`);

  /* ------------------------------------------------ 1. przewinięcie przy kliknięciach */
  console.log('');
  if (Array.isArray(r.clicks) && r.clicks.length) {
    const measured = r.clicks.filter((one) => !one.missing);
    const moved = measured.filter((one) => one.before !== one.mid || one.before !== one.after);
    check(measured.length >= 8, `zmierzonych kliknięć: ${measured.length}`);
    check(moved.length === 0,
      moved.length === 0
        ? `żadne kliknięcie nie ruszyło strony (${measured.length} kontrolek, wszystkie ${measured[0]?.before} px)`
        : `strona drgnęła przy: ${moved.map((one) => `${one.label} ${one.before}->${one.mid}->${one.after}`).join(' | ')}`);
    const lost = measured.filter((one) => one.focus === 'BODY');
    check(lost.length === 0,
      lost.length === 0
        ? 'po żadnym kliknięciu fokus nie spadł na <body>'
        : `fokus na <body> po: ${lost.map((one) => one.label).join(', ')}`);
    for (const one of measured) {
      console.log(`      ${one.label}: ${one.before} -> ${one.mid} -> ${one.after} px, fokus ${one.focus}`);
    }
  } else {
    check(false, 'pomiar kliknięć się nie wykonał');
  }

  /* ------------------------------------------------------- 2. trzy ścieżki wskaźnika */
  console.log('');
  if (r.typingSend) {
    check(r.typingSend.atClick === true, 'kropki stają w tym samym zadaniu co naciśnięcie „wyślij"');
    check(r.typingSend.during === true, 'i stoją przez cały czas oczekiwania na odpowiedź');
    check(r.typingSend.after === false, 'i gasną, gdy odpowiedź wejdzie');
    check(r.typingSend.reply === true, 'odpowiedź naprawdę weszła do rozmowy');
  } else {
    check(false, 'pomiar wskaźnika po wysłaniu się nie wykonał');
  }
  if (r.pill) {
    check(r.pill.typingShown === true, 'kropki stają po naciśnięciu pastylki kreatora');
    check(r.pill.typingGone === true, 'i gasną, gdy zdanie kreatora wejdzie');
    check(r.pill.answered === true, 'zdanie kreatora naprawdę weszło do rozmowy');
  } else {
    check(false, 'pomiar wskaźnika po pastylce się nie wykonał');
  }
  if (r.typingPoll) {
    check(r.typingPoll.whileTyping === true,
      'kropki stają, gdy organizator pisze, a odpowiedź dociąga odpytywanie');
    check(r.typingPoll.afterAnswer === false, 'i gasną razem z jego wiadomością');
    check(r.typingPoll.answerShown === true, 'wiadomość organizatora weszła do rozmowy');
  } else {
    check(false, 'pomiar wskaźnika przy odpytywaniu się nie wykonał');
  }

  /* --------------------------------------------- 3. bąbelek po pastylce, brak po kodzie */
  console.log('');
  if (r.pill) {
    check(r.pill.bubbleAdded === 1,
      `naciśnięcie pastylki tworzy dokładnie jeden bąbelek gościa: ${r.pill.bubbleAdded}`);
    check(r.pill.bubbleText === r.pill.label && r.pill.label.length > 0,
      `bąbelek nosi treść pastylki: "${r.pill.bubbleText}" wobec "${r.pill.label}"`);
    check(r.pill.scrollBefore === r.pill.scrollAfter,
      `pastylka nie ruszyła strony: ${r.pill.scrollBefore} -> ${r.pill.scrollAfter} px`);
  }
  if (r.code) {
    check(r.code.fieldThere === true, 'pole na kod stoi w rozmowie');
    check(r.code.bubblesDelta === 0, `wpisanie kodu NIE tworzy bąbelka: ${r.code.bubblesDelta}`);
    check(r.code.codeInLog === false, 'sześciu cyfr nie ma w treści rozmowy');
  } else {
    check(false, 'pomiar pola na kod się nie wykonał');
  }

  /* ------------------------------------- 6. cyfra w imieniu i nazwisku w kreatorze */
  console.log('');
  if (r.nameDigit) {
    check(r.nameDigit.liveShown === true,
      'cyfra w imieniu pokazuje błąd OD RAZU, przy wpisywaniu, nie po wysłaniu');
    check(r.nameDigit.liveText === r.nameDigit.expected,
      `ostrzeżenie jest napisem ze słownika: "${r.nameDigit.liveText}"`);
    check(r.nameDigit.liveGone === true, 'ostrzeżenie schodzi, gdy cyfry już nie ma');
    check(r.nameDigit.refused === true, 'wysłana odpowiedź z cyfrą odbija się od kreatora');
    check(r.nameDigit.stillPerson === true,
      'kreator zostaje na pytaniu o imię i nazwisko, nie idzie dalej z cyfrą w polu');
    check(r.nameDigit.acceptedClean === true, 'imię i nazwisko bez cyfr przechodzi');
  } else {
    check(false, 'pomiar cyfry w imieniu się nie wykonał');
  }

  /* ------------------------------------------- 7. zdjęcie i odsyłacz, oba opcjonalne */
  console.log('');
  if (r.optional) {
    check(r.optional.logoAsked === true, 'po telefonie kreator pyta o zdjęcie albo logo');
    check(r.optional.linkAsked === true, 'pominięcie zdjęcia prowadzi do pytania o odsyłacz');
    check(r.optional.badLinkRefused === true, 'odsyłacz bez https:// odbija się z komunikatem');
    check(r.optional.notFixedForUs === true,
      'strona NIE dokleja https:// za gościa — mówi, czego brakuje');
    check(r.optional.emailAsked === true, 'pominięcie odsyłacza prowadzi do pytania o adres');
  } else {
    check(false, 'pomiar kroków opcjonalnych się nie wykonał');
  }

  /* --------------------------------------------- 8. podsumowanie i „nie, popraw" */
  console.log('');
  if (r.summary) {
    check(r.summary.shown === true, 'przed wysłaniem staje podsumowanie zgłoszenia');
    check(r.summary.gateBefore === false,
      'i staje PRZED bramką: kod wychodzi dopiero po potwierdzeniu');
    check(r.summary.cart && r.summary.person && r.summary.phone && r.summary.email,
      `podsumowanie wymienia wszystkie podane dane (nazwa ${r.summary.cart},`
      + ` osoba ${r.summary.person}, telefon ${r.summary.phone}, adres ${r.summary.email})`);
    check(r.summary.skipped === 2,
      `pominięte zdjęcie i odsyłacz są wypisane jako pominięte: ${r.summary.skipped} z 2`);
    check(r.summary.chips.length === 2,
      `dwie pastylki: tak, wyślij / nie, popraw (${r.summary.chips.join(' | ')})`);
  } else {
    check(false, 'pomiar podsumowania się nie wykonał');
  }
  if (r.fix) {
    check(r.fix.asked === true, '„nie, popraw" pyta, które pole poprawić');
    check(r.fix.menu.length === 7, `menu poprawek ma pole na każdą odpowiedź i wyjście: ${r.fix.menu.length}`);
    check(r.fix.backToSummary === true, 'po poprawce jednego pola wraca podsumowanie');
    check(r.fix.keptCart && r.fix.keptPerson && r.fix.keptEmail,
      `„nie, popraw" NIE gubi wcześniejszych odpowiedzi (nazwa ${r.fix.keptCart},`
      + ` osoba ${r.fix.keptPerson}, adres ${r.fix.keptEmail})`);
    check(r.fix.newPhone === true && r.fix.oldPhoneGone === true,
      `poprawione pole ma nową wartość, nie starą (nowy ${r.fix.newPhone}, stary ${!r.fix.oldPhoneGone})`);
  } else {
    check(false, 'pomiar menu poprawek się nie wykonał');
  }

  /* ------------------------------------------------------- 5. klawiatura na telefonie */
  console.log('');
  const shots = [r.keyboardBefore, r.keyboardClosed, r.keyboardOpen, r.keyboardBack].filter(Boolean);
  for (const s of shots) {
    console.log(`      ${s.label}: widok ${s.viewportH} px (okno ${s.innerH}), --screen-h ${s.screenH}`
      + `, --chat-vh ${s.chatVh || '(brak)'}, sufit dziennika ${s.logCap}`);
    console.log(`         dziennik ${s.log ? s.log.height : '-'} px, pastylki do ${s.chips ? s.chips.bottom : '-'} px`
      + `, kompozytor do ${s.composer ? s.composer.bottom : '-'} px, dolna krawędź widoku ${s.visibleBottom} px`);
    console.log(`         dokument ${s.docH} px (maks. przewinięcie ${s.docMax}), przewinięcie ${s.docY} px`
      + `, fokus ${s.focus}, czat od dziennika do kompozytora ${s.chatSpan} px`);
  }

  /* ----------------------------- 1b. dotknięcie pola nie rusza przewinięcia dokumentu */
  console.log('');
  if (r.keyboardBefore && r.keyboardOpen && r.keyboardBack) {
    const before = r.keyboardBefore;
    const closed = r.keyboardClosed;
    const open = r.keyboardOpen;
    const back = r.keyboardBack;
    check(before.docY === closed.docY,
      `wpisanie długiej wiadomości i dotknięcie pola nie ruszają strony:`
      + ` ${before.docY} -> ${closed.docY} px`);
    check(before.docY === open.docY,
      `otwarcie klawiatury nie rusza strony: ${before.docY} -> ${open.docY} px`);
    check(before.docY === back.docY,
      `zwinięcie klawiatury zostawia stronę tam, gdzie była: ${before.docY} -> ${back.docY} px`);
    /* Wysokość dokumentu mierzona osobno od przewinięcia, bo to ONA jest przyczyną:
       dokument, który przy klawiaturze robi się niższy, przycina przewinięcie i nikt go
       potem nie przywraca. Ta asercja pilnuje przyczyny, tamte trzy — skutku. */
    check(closed.docH === before.docH,
      `rosnące pole wiadomości nie zmienia wysokości dokumentu:`
      + ` ${before.docH} -> ${closed.docH} px`);
    check(open.docH === before.docH,
      `klawiatura nie zmienia wysokości dokumentu: ${before.docH} -> ${open.docH} px`);
    check(back.docH === before.docH,
      `i po jej zwinięciu wysokość jest ta sama: ${before.docH} -> ${back.docH} px`);
    /* Klawiatura ZOSTAJE OTWARTA. Bez tego warunku „strona nie drgnęła" dałoby się
       spełnić najgorszym sposobem: zdjęciem fokusa z pola, czyli zwinięciem klawiatury
       w połowie pisania. */
    check(open.focus.startsWith('TEXTAREA'),
      `przy otwartej klawiaturze fokus siedzi w polu wiadomości: ${open.focus}`);
    check(back.focus.startsWith('TEXTAREA'),
      `i nie spada z niego po zmianie widoku: ${back.focus}`);
  } else {
    check(false, 'pomiar dotknięcia pola się nie wykonał');
  }
  if (r.keyboardOpen && r.keyboardOpen.chips && r.keyboardOpen.composer) {
    const k = r.keyboardOpen;
    check(k.viewportH < k.innerH,
      `klawiatura naprawdę skróciła widok: ${k.innerH} -> ${k.viewportH} px`);
    check(k.chipsBelow <= 0,
      `pasek pastylek nad polem stoi nad klawiaturą, nie pod nią: ${k.chipsBelow} px poniżej krawędzi`);
    check(k.composerBelow <= 0,
      `kompozytor z przyciskiem wysyłki stoi nad klawiaturą: ${k.composerBelow} px poniżej krawędzi`);
    check(k.send !== null && k.send.bottom <= k.composer.bottom + 1,
      'przycisk wysyłki jest w kompozytorze, nie pod nim');
  } else {
    check(false, 'pomiar przy otwartej klawiaturze się nie wykonał');
  }
  if (r.keyboardClosed && r.keyboardClosed.composer) {
    check(r.keyboardClosed.composerBelow <= 0,
      `przy zamkniętej klawiaturze kompozytor też jest widoczny: ${r.keyboardClosed.composerBelow} px`);
  }
  /* Po zwinięciu klawiatury sprawdzana jest WIDOCZNOŚĆ, nie ten sam piksel co przed jej
     otwarciem. Bezwzględna pozycja wolno się zmienić: klawiatura zdejmuje na telefonie
     przyklejony pasek działania (patrz `is-keyboard-hidden` w app.js), a to jest zmiana
     układu poza czatem. Warunek „ten sam piksel" łapałby ją jako błąd czatu. */
  if (r.keyboardBack && r.keyboardBack.composer && r.keyboardBack.chips) {
    check(r.keyboardBack.composerBelow <= 0 && r.keyboardBack.chipsBelow <= 0,
      `po zwinięciu klawiatury czat nadal jest cały widoczny (kompozytor `
      + `${r.keyboardBack.composerBelow} px, pastylki ${r.keyboardBack.chipsBelow} px od krawędzi)`);
    check(Number.parseFloat(r.keyboardBack.logCap) >= Number.parseFloat(r.keyboardOpen.logCap),
      `sufit dziennika wraca po zwinięciu klawiatury: ${r.keyboardOpen.logCap} -> ${r.keyboardBack.logCap}`);
  }

  /* --------------------------------------------------- 2. czat wyższy, ale nadal w kadrze */
  console.log('');
  if (r.keyboardBefore && r.keyboardBefore.log
      && r.keyboardClosed && r.keyboardClosed.log && r.keyboardOpen && r.keyboardOpen.log) {
    const idle = r.keyboardBefore;
    const closed = r.keyboardClosed;
    const open = r.keyboardOpen;
    /* Liczby wzięte z pomiaru, nie z sufitu.
       ---------------------------------------------------------------------------
       Przy 390x844 widoczna wysokość to 749 px (pasek adresu zabiera 95 px). PRZED zmianą
       dziennik miał 285 px w każdym stanie, bo wiązał go sufit — 38% widoku, zgłoszone jako
       „za niski". Teraz wiąże go stała wysokość panelu (0,82 widoku ekranu), więc dziennik
       bierze wszystko, czego nie potrzebuje reszta: 405 px przy pustym polu, 343 px przy
       polu rozrośniętym do czterech wierszy. Progi 380 i 330 px stoją tuż pod tymi dwoma
       pomiarami — mają złapać cofnięcie tej poprawki, a nie pojedynczy piksel różnicy
       w łamaniu napisu. */
    check(idle.log.height >= 380,
      `przy zamkniętej klawiaturze i pustym polu dziennik ma co najmniej 380 px:`
      + ` ${idle.log.height} px`
      + ` (${Math.round((idle.log.height / idle.viewportH) * 100)}% widoku ${idle.viewportH} px)`);
    /* Druga liczba pilnuje TEGO SAMEGO, co asercja o wysokości dokumentu wyżej, tylko od
       drugiej strony: pole rosnące z tekstem zabiera miejsce DZIENNIKOWI, a nie stronie. */
    check(closed.log.height >= 330,
      `z długą wiadomością w polu dziennik nadal ma co najmniej 330 px: ${closed.log.height} px`);
    check(open.log.height >= 90,
      `przy otwartej klawiaturze dziennik nie znika: ${open.log.height} px`);
    check(open.log.height < closed.log.height,
      `i naprawdę ustępuje miejsca klawiaturze: ${closed.log.height} -> ${open.log.height} px`);
    /* Warunek nienaruszalny ze zgłoszenia, sprawdzony jako WYSOKOŚĆ, nie jako pozycja:
       cały czat, którym się rozmawia (dziennik + podpowiedzi + kompozytor), musi się
       zmieścić w tym, co widać przy otwartej klawiaturze. Pozycję pilnują asercje
       o `chipsBelow` i `composerBelow` wyżej, ale one zależą od tego, gdzie stoi
       przewinięcie; ta jest od niego niezależna. */
    check(open.chatSpan > 0 && open.chatSpan <= open.viewportH,
      `przy otwartej klawiaturze cały czat mieści się w widoku: ${open.chatSpan} px`
      + ` z ${open.viewportH} px`);
  } else {
    check(false, 'pomiar wysokości dziennika się nie wykonał');
  }

  /* ----------------------------------- 3. dziennik stoi na najnowszej wiadomości */
  console.log('');
  if (r.stick) {
    const s = r.stick;
    console.log(`      dziennik przewijalny: ${s.scrollable}, brak do dołu po przewinięciu w górę:`
      + ` ${s.gapScrolledUp} px`);
    console.log(`      po własnej wysyłce ${s.gapAfterOwnSend} px, po wiadomości organizatora`
      + ` ${s.gapAfterOrganiser} px (przed nią ${s.gapBeforeOrganiser} px),`
      + ` po wierszu systemowym ${s.gapAfterSystem} px`);
    check(s.scrollable === true,
      'dziennik ma co przewijać — treść jest wyższa od pudełka');
    check(s.gapScrolledUp > 60,
      `ręczne przewinięcie w górę naprawdę zdjęło widok z dołu: ${s.gapScrolledUp} px`);
    check(s.gapAfterOwnSend <= 4,
      `po wysłaniu własnej wiadomości dziennik stoi na dole: ${s.gapAfterOwnSend} px do dołu`);
    check(s.docYAfterOwnSend === s.docYBefore,
      `i dociągnięty jest DZIENNIK, nie strona: ${s.docYBefore} -> ${s.docYAfterOwnSend} px`);
    check(s.gapBeforeOrganiser > 60,
      `przed wiadomością organizatora czytający jest wyżej: ${s.gapBeforeOrganiser} px do dołu`);
    check(s.organiserShown === true, 'wiadomość organizatora naprawdę weszła do dziennika');
    check(s.gapAfterOrganiser > 60,
      `i NIE wyrwała widoku czytającemu, który był wyżej: ${s.gapAfterOrganiser} px do dołu`);
    check(s.docYAfterOrganiser === s.docYBefore,
      `ani nie ruszyła strony: ${s.docYBefore} -> ${s.docYAfterOrganiser} px`);
    check(s.systemShown === true, 'wiersz systemowy naprawdę stanął w dzienniku');
    check(s.gapAfterSystem <= 4,
      `wiersz systemowy też ląduje na widocznym dole: ${s.gapAfterSystem} px do dołu`);
    check(s.docYAfterSystem === s.docYBefore,
      `i on też nie rusza strony: ${s.docYBefore} -> ${s.docYAfterSystem} px`);
  } else {
    check(false, 'pomiar dociągania dziennika się nie wykonał');
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
