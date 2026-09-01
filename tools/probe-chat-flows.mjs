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
    theirTyping: false, pollMessages: [], sends: 0, polls: 0
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
