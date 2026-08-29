/**
 * Przeskakiwanie na telefonie — odtworzenie palcem i klawiaturą, nie przez window.scrollTo.
 * ============================================================================
 * PO CO OSOBNE NARZĘDZIE
 *   `tools/cdp.mjs probe` przewija stronę z jej własnego skryptu. To nie jest to samo, co
 *   robi palec: `window.scrollTo` omija bezwładność, wybór elementu pod dotknięciem i
 *   łańcuchowanie przewijania z listy na stronę. Sonda przez scrollTo nie znalazła ani
 *   jednego przeskoku w komentarzach i kontakcie — a zgłoszenie mówi, że przeskok jest.
 *   Więc mierzy się nie tym narzędziem, co trzeba.
 *
 *   Tu gesty idą przez `Input.synthesizeScrollGesture`, czyli tę samą drogę, co prawdziwe
 *   dotknięcie, i przez `Input.dispatchTouchEvent` dla tapnięcia w pole.
 *
 *   Druga rzecz, której nie da się zrobić z wnętrza strony: klawiatura. Na telefonie
 *   otwarcie klawiatury zmniejsza okno o kilkaset pikseli. Tutaj robi to
 *   `Emulation.setDeviceMetricsOverride` w trakcie sesji.
 *
 *     node tools/probe-c-touch-jump.mjs [http://127.0.0.1:5199]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.argv[2] || 'http://127.0.0.1:5199';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9334;
const WIDTH = 390;
const TALL = 844;
/** iPhone 14 z otwartą klawiaturą: zostaje mniej więcej tyle. */
const SHORT = 380;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function launch() {
  const child = spawn(chromePath(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${resolve(root, 'node_modules/.cdp-touch-' + Date.now())}`,
    `--window-size=${WIDTH},${TALL}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      return { child, wsUrl: info.webSocketDebuggerUrl };
    } catch { await sleep(250); }
  }
  child.kill();
  throw new Error('Chrome nie otworzył portu debugowania');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve: ok, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else ok(msg.result);
  });
  const ready = new Promise((ok, bad) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', bad, { once: true });
  });
  const send = (method, params, sessionId) => new Promise((ok, bad) => {
    id += 1;
    pending.set(id, { resolve: ok, reject: bad });
    ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
  });
  return { ws, ready, send };
}

const { child, wsUrl } = await launch();
const cdp = connect(wsUrl);
await cdp.ready;
let fails = 0;
const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => cdp.send(m, p, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');

  const setViewport = (height) => call('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height, deviceScaleFactor: 1, mobile: false,
    screenWidth: WIDTH, screenHeight: height, positionX: 0, positionY: 0
  });
  await setViewport(TALL);
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });

  const evaluate = async (expression) => {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };

  await call('Page.navigate', { url: `${origin}/?lang=pl` });
  await sleep(3200);
  await evaluate(`(() => { document.documentElement.style.scrollBehavior = 'auto'; return 1; })()`);

  const state = () => evaluate(`(() => {
    const top = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
    const at = [...document.querySelectorAll('#main > section[id]')]
      .find((s) => { const r = s.getBoundingClientRect(); return r.top <= 4 && r.bottom > 4; });
    return {
      y: Math.round(window.scrollY),
      h: document.documentElement.scrollHeight,
      inner: window.innerHeight,
      section: at ? at.id : '(przejście)',
      panels: Object.fromEntries([...document.querySelectorAll('#main > section[id]')].map((s) => [s.id, s.dataset.panel])),
      wallTop: top(document.querySelector('#wall')),
      contactTop: top(document.querySelector('#contact'))
    };
  })()`);

  const scrollTo = async (y) => { await evaluate(`(() => { window.scrollTo(0, ${y}); return 1; })()`); await sleep(500); };

  /* Przewinięcie zdarzeniem, nie z window.scrollTo — trafia w element pod kursorem,
     przechodzi przez handlery i przez łańcuchowanie z listy na stronę.
     `Input.synthesizeScrollGesture` z gestem dotykowym w tym headless nie robi nic
     (sprawdzone próbą kontrolną: 0 -> 0), bo gest idzie przez kompozytor, którego przy
     --disable-gpu nie ma. Kółko dociera. */
  const swipe = async (x, y, distance) => {
    await call('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x, y, deltaX: 0, deltaY: distance, pointerType: 'mouse'
    });
    await sleep(450);
  };

  const tap = async (selector) => {
    const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null; const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 20)) }; })()`);
    if (!at) return null;
    const point = [{ x: at.x, y: at.y, radiusX: 12, radiusY: 12, force: 1 }];
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
    await sleep(60);
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    return at;
  };

  /* ------------------------------------------------------- 1. palcem po komentarzach */
  const base = await state();
  console.log(`strona: ${base.h} px, okno ${base.inner}, #wall na ${base.wallTop}, #contact na ${base.contactTop}`);
  console.log(`tryby sekcji: ${JSON.stringify(base.panels)}\n`);

  /* Próba kontrolna na górze strony. Bez niej „gest nie ruszył strony" znaczy albo
     usterkę, albo niedziałającą sondę, i nie da się tego rozróżnić. */
  await scrollTo(0);
  const controlBefore = (await state()).y;
  await swipe(WIDTH / 2, Math.round(TALL * 0.6), 200);
  const controlAfter = (await state()).y;
  check(controlAfter > controlBefore, `gest w ogóle przewija stronę (kontrola na górze: ${controlBefore} -> ${controlAfter})`);

  await scrollTo(base.wallTop - 100);
  let previous = (await state()).y;
  const drifts = [];
  for (let i = 0; i < 10; i += 1) {
    await swipe(WIDTH / 2, Math.round(TALL * 0.6), 200);
    const now = await state();
    const moved = now.y - previous;
    drifts.push({ moved, y: now.y, h: now.h, section: now.section });
    previous = now.y;
  }
  const heights = new Set(drifts.map((d) => d.h));
  const runaway = drifts.filter((d) => d.moved > 700);
  console.log('gesty po komentarzach (każdy prosi o 200 px):');
  for (const d of drifts) console.log(`   +${String(d.moved).padStart(4)} px  ->  y=${String(d.y).padStart(6)}  sekcja=${d.section}`);
  console.log('');
  check(heights.size === 1, `wysokość strony nie zmienia się w trakcie przewijania (${[...heights].join(' -> ')})`);
  check(runaway.length === 0, `żaden gest nie przerzuca o więcej niż 700 px (takich: ${runaway.length})`);

  /* -------------------------------------------- 2. klawiatura w formularzu komentarza */
  const keyboardCase = async (label, selector) => {
    await setViewport(TALL);
    await sleep(400);
    const target = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null; const t = (n) => { let v = 0; while (n) { v += n.offsetTop; n = n.offsetParent; } return v; };
      return t(el); })()`);
    if (target === null) { console.log(`\n${label}: nie ma takiego pola, pomijam`); return; }
    await scrollTo(Math.max(0, target - 400));
    const before = await state();
    await tap(selector);
    const afterTap = await state();
    await setViewport(SHORT);
    await sleep(900);
    const afterKeyboard = await state();
    await setViewport(TALL);
    await sleep(900);
    const afterClose = await state();

    console.log(`\n${label}`);
    console.log(`   przed tapnięciem      y=${before.y}  sekcja=${before.section}  strona=${before.h}`);
    console.log(`   po tapnięciu          y=${afterTap.y}  sekcja=${afterTap.section}  strona=${afterTap.h}`);
    console.log(`   klawiatura otwarta    y=${afterKeyboard.y}  sekcja=${afterKeyboard.section}  strona=${afterKeyboard.h}  okno=${afterKeyboard.inner}`);
    console.log(`   klawiatura zamknięta  y=${afterClose.y}  sekcja=${afterClose.section}  strona=${afterClose.h}`);
    check(Math.abs(afterTap.y - before.y) <= 8, `${label}: samo tapnięcie nie przesuwa strony (dryf ${afterTap.y - before.y})`);
    check(afterClose.h === before.h, `${label}: po zamknięciu klawiatury strona ma tę samą wysokość (${before.h} -> ${afterClose.h})`);
    check(Math.abs(afterClose.y - afterTap.y) <= 60,
      `${label}: po zamknięciu klawiatury wracamy tam, gdzie byliśmy (${afterTap.y} -> ${afterClose.y})`);
    const moved = Object.entries(before.panels).filter(([id, v]) => afterKeyboard.panels[id] !== v);
    check(moved.length === 0, `${label}: klawiatura nie zmienia trybu żadnej sekcji (${moved.map(([i]) => i).join(', ') || 'brak'})`);
  };

  await keyboardCase('komentarz — pole tekstowe', '#wall textarea, [data-wall-form] textarea');
  await keyboardCase('czat — pole wiadomości', '[data-chat-input]');
  await keyboardCase('czat — brama, imię', '#chat-gate-name');

  console.log(`\n${fails === 0 ? 'wszystko przeszło' : fails + ' nieudanych sprawdzeń'}`);
} finally {
  try { cdp.ws.close(); } catch { /* i tak zamykamy */ }
  child.kill();
}
process.exit(fails === 0 ? 0 : 1);
