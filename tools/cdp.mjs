/**
 * Real-browser probe and screenshot tool over the Chrome DevTools Protocol.
 *
 * Why not --dump-dom: it dumps as soon as load fires, and --virtual-time-budget
 * freezes rAF, IntersectionObserver and the GSAP ticker. Anything animated could
 * not be measured. CDP runs against a live page in real time, so scroll handlers,
 * tweens and autoplay all behave the way they do for a visitor.
 *
 * Usage:
 *   node tools/cdp.mjs probe tools/probe-stack.js [--w 1440] [--h 900] [--url /]
 *   node tools/cdp.mjs shot out.png [--w 1440] [--h 900] [--url /] [--y 2400]
 *                                   [--full] [--wait 1500]
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9333;

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg1 = argv[1];
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const next = argv[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
};

const width = Number(flag('w', 1440));
const height = Number(flag('h', 900));
const path = String(flag('url', '/'));
const waitMs = Number(flag('wait', 1800));
const origin = String(flag('origin', 'http://localhost:5199'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Profil przegladarki na jeden przebieg — i USUWANY po nim.
   ---------------------------------------------------------------------------
   Swiezy profil jest konieczny: zapamietane `localStorage` sprawialo, ze przycisk obecnosci
   przychodzil juz nacisniety i cichu unieważnial nastepny pomiar. Ale kazdy taki profil to
   kilkanascie do kilkudziesieciu megabajtow, a nic ich nie kasowalo.

   ZMIERZONE 04.09: 147 katalogow `.cdp-profile-*` i `.cdp-touch-*` w node_modules, razem
   2,8 GB — dysk doszedl do 100% i zapis pliku w trakcie edycji SKROCIL GO DO ZERA. Sonda,
   ktora zapelnia dysk, potrafi zniszczyc plik, ktory wlasnie mierzy.

   `maxRetries` i `force`, bo Chrome na Windowsie zwalnia uchwyty z opoznieniem i pierwsza
   proba usuniecia bywa odrzucona. Niepowodzenie jest przelykane: sprzatanie nie ma prawa
   przewrocic przebiegu, ktorego wynik wlasnie zostal wypisany. */
const profileDir = resolve(root, 'node_modules/.cdp-profile-' + Date.now());

function removeProfile() {
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }); }
  catch { /* zostanie na dysku; lepiej to niz wywrocony pomiar */ }
}

async function launch() {
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--disable-extensions',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      /**
       * DOKŁADNY ODCZYT `performance.memory.usedJSHeapSize`.
       * =====================================================================
       * Bez tej flagi Chrome celowo zaokrągla `performance.memory` — wartości są kwantowane
       * (rząd 100 kB), aktualizowane najwyżej raz na 20 minut i identyczne dla różnych stanów
       * strony. To jest zabezpieczenie przed odczytem cudzej pamięci przez stronę, ale w sondzie
       * uruchamianej lokalnie znaczy tylko jedno: pomiar „ile strona dokłada po wejściu w sekcję
       * nagród" wychodzi TAKI SAM przed i po naprawie, bo różnica ginie w zaokrągleniu.
       *
       * ZMIERZONE: bez flagi trzy punkty pomiaru sondy tools/probe-c-prizes-memory.js dawały
       * ten sam odczyt kopca co do kilobajta, mimo że między nimi strona przewijała się przez
       * kilkanaście przypiętych sekcji i przeszła całą dwunastokartową talię. Z flagą każdy
       * punkt ma własną liczbę i różnicę da się porównać przed i po zmianie.
       *
       * Flaga dotyczy WYŁĄCZNIE przeglądarki uruchamianej przez ten harness do pomiaru — nie
       * ma wpływu na to, co dostaje odwiedzający.
       */
      '--enable-precise-memory-info',
      `--remote-debugging-port=${PORT}`,
      // A fresh profile every run: a persisted localStorage made the attendance
      // button arrive already pressed and silently voided the next measurement.
      // Sprzatany po sobie w `finally` na dole — patrz `profileDir`.
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height}`,
      'about:blank'
    ],
    { windowsHide: true, stdio: 'ignore' }
  );
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const info = await res.json();
      return { child, wsUrl: info.webSocketDebuggerUrl };
    } catch {
      await sleep(250);
    }
  }
  child.kill();
  throw new Error('Chrome did not open a debugging port');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: ok, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else ok(msg.result);
    } else {
      events.push(msg);
    }
  });
  const ready = new Promise((ok, bad) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', bad, { once: true });
  });
  const send = (method, params, sessionId) =>
    new Promise((ok, bad) => {
      id += 1;
      pending.set(id, { resolve: ok, reject: bad });
      ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  return { ws, ready, send, events };
}

async function withPage(fn) {
  const { child, wsUrl } = await launch();
  const cdp = connect(wsUrl);
  await cdp.ready;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const call = (m, p) => cdp.send(m, p, sessionId);

    await call('Page.enable');
    await call('Runtime.enable');
    /**
     * `mobile: true` made Chrome apply its own meta-viewport handling on top of
     * the override, and the layout viewport came out at 680 px while
     * window.innerWidth reported 444 — every measurement taken at "390 px" was
     * against neither number. With mobile off, the CSS viewport is exactly the
     * width asked for, which is what the media queries are written against.
     * Touch is emulated separately so pointer events still behave like a phone.
     */
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
      positionX: 0,
      positionY: 0
    });
    if (width < 700) {
      await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await call('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    }

    const logs = [];
    cdp.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        logs.push((msg.params.args || []).map((a) => a.value || a.description || '?').join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      }
    });

    /**
     * Runs before any page script. Needed for anything the app reads once at
     * startup — window.CARRULEDDHI_CONFIG, localStorage — where setting it after
     * load would be too late to change behaviour.
     */
    const injectFile = flag('inject', '');
    if (injectFile && injectFile !== true) {
      await call('Page.addScriptToEvaluateOnNewDocument', {
        source: readFileSync(resolve(root, String(injectFile)), 'utf8')
      });
    }

    await call('Page.navigate', { url: origin + path });
    await sleep(waitMs);

    /**
     * PRAWDZIWE DOTKNIĘCIE, DOSTĘPNE Z WNĘTRZA SONDY: `await window.__tap(x, y)`.
     * =========================================================================
     *
     * DLACZEGO NIE WYSTARCZA `element.click()` ANI `dispatchEvent`
     *   Jedno i drugie to wywołanie funkcji na WSKAZANYM elemencie. Trafia w niego zawsze:
     *   także wtedy, gdy leży pod nakładką, pod przyklejonym paskiem, poza ekranem albo ma
     *   zerową wysokość. Sonda zbudowana na `click()` jest zielona na stronie, na której nie
     *   da się nic dotknąć — i dokładnie to się stało: dwie sondy głosowania przechodziły,
     *   a na telefonie nie dało się oddać głosu.
     *
     *   Zdarzenia budowane w skrypcie mają jeszcze drugą wadę: `isTrusted: false` i brak
     *   trafiania (hit-testu) przeglądarki. Nie ustawiają fokusu, nie wyzwalają zachowań
     *   domyślnych zastrzeżonych dla gestu i nie sprawdzają, KTO leży w danym punkcie.
     *
     * CO ROBI TA ZAŚLEPKA
     *   `Input.dispatchTouchEvent` to dotknięcie wysłane przez protokół, czyli ta sama droga,
     *   którą wchodzi palec: przeglądarka sama trafia w element pod punktem, sama dokłada
     *   `pointerdown`/`mousedown`/`click`, sama ustawia fokus i sama decyduje, że nakładka
     *   przechwyciła dotknięcie zamiast przycisku pod nią.
     *
     * DLACZEGO PRZEZ WIĄZANIE, A NIE FLAGĄ Z WIERSZA POLECEŃ
     *   Droga do głosu ma pięć dotknięć, a każde następne jest w miejscu policzonym PO
     *   poprzednim (przycisk wyrasta tam, gdzie stał inny). Lista selektorów podana z zewnątrz
     *   nie umie tego wyrazić — sonda musi móc dotknąć, zmierzyć i dotknąć znowu.
     *
     * Wiązanie dokładane KAŻDEJ sondzie, nie tylko tej jednej: nic nie kosztuje, gdy nikt go
     * nie woła, a sonda, która chce mierzyć dotknięcia, nie musi zmieniać harnessu.
     */
    await call('Runtime.addBinding', { name: '__tapNative' });
    await evaluate(call, `(() => {
      const waiting = new Map();
      let seq = 0;
      window.__tapDone = (id) => { const done = waiting.get(id); waiting.delete(id); if (done) done(true); };
      window.__tap = (x, y) => new Promise((done) => {
        seq += 1;
        waiting.set(seq, done);
        window.__tapNative(JSON.stringify({ id: seq, x: Math.round(x), y: Math.round(y) }));
      });
      return 1;
    })()`);
    cdp.ws.addEventListener('message', async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method !== 'Runtime.bindingCalled' || msg.params.name !== '__tapNative') return;
      const { id, x, y } = JSON.parse(msg.params.payload);
      const point = [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }];
      try {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
        /* Sześćdziesiąt milisekund między przyłożeniem i podniesieniem palca: krótsze bywa
           odczytane jako drgnięcie, dłuższe jako przytrzymanie z menu kontekstowym. */
        await sleep(60);
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } catch (error) {
        logs.push('TAP ' + error.message);
      }
      await evaluate(call, `window.__tapDone(${id})`);
    });

    return await fn(call, logs);
  } finally {
    try { cdp.ws.close(); } catch { /* closing anyway */ }
    /**
     * Cała gałąź procesów Chrome, nie sam proces uruchomiony przez `spawn`.
     * =========================================================================
     * `child.kill()` zabijał proces nadrzędny, a przeglądarka zostawała i DALEJ NASŁUCHIWAŁA na
     * porcie 9333. Kolejne uruchomienie sondy pytało `\json\version`, dostawało odpowiedź od tej
     * starej przeglądarki i podłączało się do NIEJ — razem z jej `localStorage`.
     *
     * ZMIERZONE: dwa przebiegi tej samej sondy pod rząd dawały różne wyniki, bo w drugim
     * `savedVoter()` widział adres wpisany w pierwszym i okno oceny pokazywało „zagłosuj tym
     * adresem" zamiast pól. Znaleziony proces chrome.exe słuchał na 9333 od kilku godzin, mimo
     * że wszystkie sondy dawno się zakończyły. Sonda, której wynik zależy od poprzedniego
     * uruchomienia, nie mierzy strony, tylko historię własnych uruchomień.
     *
     * `/T` zabija drzewo (Chrome to kilkanaście procesów), `/F` bez pytania.
     */
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch { /* Chrome mógł się już zamknąć sam */ }
    child.kill();
    /* Po zabiciu drzewa, nie przed: dopoki Chrome zyje, trzyma pliki profilu otwarte. */
    removeProfile();
  }
}

async function evaluate(call, expression) {
  const res = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (res.exceptionDetails) {
    return { error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  }
  return res.result.value;
}

if (cmd === 'probe') {
  const probe = readFileSync(resolve(arg1), 'utf8').trim().replace(/;$/, '');
  const hoverSel = flag('hover', '');
  const scrollFirst = Number(flag('scroll', 0));
  const out = await withPage(async (call, logs) => {
    /**
     * :hover cannot be forced from page script, so a real mouse move is
     * dispatched through the protocol. Without this there is no way to prove a
     * hover-only rule actually applies rather than merely existing in the sheet.
     */
    if (scrollFirst) {
      await evaluate(call, `(() => { document.documentElement.style.scrollBehavior='auto';
        document.documentElement.style.scrollSnapType='none'; scrollTo(0, ${scrollFirst}); return 1; })()`);
      await sleep(700);
    }
    if (hoverSel && hoverSel !== true) {
      const at = await evaluate(
        call,
        `(() => { const el = document.querySelector(${JSON.stringify(hoverSel)});
          if (!el) return null; const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`
      );
      if (at && at.x !== undefined) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y, buttons: 0 });
        await sleep(700);
      }
      logs.push(`hover dispatched at ${JSON.stringify(at)}`);
    }
    const value = await evaluate(
      call,
      `(async () => { const f = ${probe}; return await f(document, window); })()`
    );
    return { consoleErrors: logs, ...value };
  });
  console.log(JSON.stringify(out, null, 1));
} else if (cmd === 'shot') {
  const y = Number(flag('y', 0));
  const full = Boolean(flag('full', false));
  const selector = flag('sel', '');
  const out = resolve(root, arg1);
  mkdirSync(dirname(out), { recursive: true });
  const meta = await withPage(async (call, logs) => {
    await evaluate(
      call,
      `(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        document.documentElement.style.scrollSnapType = 'none';
        window.scrollTo(0, ${y});
        return true;
      })()`
    );
    await sleep(700);
    let clip;
    if (selector && selector !== true) {
      clip = await evaluate(
        call,
        `(() => { const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null; const r = el.getBoundingClientRect();
          return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 }; })()`
      );
    }
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: full || Boolean(clip),
      ...(clip ? { clip } : {})
    });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    const where = await evaluate(call, 'JSON.stringify({ y: Math.round(scrollY), h: document.body.scrollHeight })');
    return { file: arg1, where, consoleErrors: logs };
  });
  console.log(JSON.stringify(meta, null, 1));
} else {
  console.log('commands: probe <file.js> | shot <out.png>');
  process.exit(1);
}
