/**
 * Pasek adresu a wysokość dokumentu — decydujący pomiar przeskakiwania przy przewijaniu.
 *
 *     node tools/probe-urlbar-doc.mjs [http://127.0.0.1:4173] [/index.html] [--no-touch]
 *
 * CO SPRAWDZA I DLACZEGO WŁAŚNIE TO
 *   Przewijanie palcem na telefonie chowa i pokazuje pasek adresu, a każde takie ruszenie
 *   zmienia wysokość widoku o 60–180 px. Jeśli cokolwiek w układzie liczy się z wysokości
 *   okna, dokument zmienia przy tym całkowitą wysokość — i wszystko poniżej bieżącego miejsca
 *   przesuwa się o tę różnicę. Z zewnątrz wygląda to jak przeskok do innej sekcji i powrót.
 *
 *   Zapis z telefonu zgłaszającego, rejestrator z `?jump=1`:
 *     okno 797 → 615 px, dokument 13095 → 11143 px (−1952), i tak dziewięć razy w 18 sekund.
 *
 *   Odtworzone tutaj przed poprawką: 1891 px rozrzutu przy oknie 844 → 662. Po poprawce: 0.
 *
 * CZYM RÓŻNI SIĘ OD probe-urlbar-jump.mjs
 *   Tamten sprawdza, czy WERDYKTY `pinned` / `flow` z app.js są stałe mimo ruchu paska — i
 *   przechodził, także wtedy, gdy usterka była w pełni obecna. Bo przyczyna nie była w
 *   JavaScripcie: sekcje brały wysokość z `100svh` w CSS, a na przeglądarce zgłaszającego ta
 *   jednostka nie jest stała. Ten plik mierzy skutek, nie decyzję: wysokość dokumentu.
 *
 * DLACZEGO NIE PRZEZ tools/cdp.mjs
 *   Tamten wykonuje sondę w JEDNYM rozmiarze okna, a cała rzecz polega na zmianie wysokości
 *   widoku W TRAKCIE życia strony. Strona nie może zmienić rozmiaru okna sama, więc musi to
 *   zrobić protokół — stąd własne połączenie po CDP.
 *
 * DWA TORY
 *   Z emulacją dotyku (domyślnie) zmiana samej wysokości ma zostać ZIGNOROWANA: na telefonie
 *   to zawsze pasek albo klawiatura. Z `--no-touch` ma zostać PRZYJĘTA po chwili: na
 *   komputerze to człowiek ciągnący dolną krawędź okna. Patrz `onResize` w app.js.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ORIGIN = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4173';
const PAGE = args.find((a) => a.startsWith('/')) || '/index.html';
const NO_TOUCH = args.includes('--no-touch');

/** 844 → 662 to 182 px, dokładnie tyle, ile ruszał się pasek na telefonie zgłaszającego. */
const TALL = 844;
const SHORT = 662;
const PORT = 9445;

const chromePath = () => {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Nie znalazlem Chrome.');
  return found;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(chromePath(), [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${resolve(root, 'node_modules/.urlbar-' + Date.now())}`,
  'about:blank'
], { windowsHide: true, stdio: 'ignore' });

let wsUrl = '';
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
  } catch { await sleep(250); }
}
if (!wsUrl) { child.kill(); throw new Error('Chrome nie otworzyl portu debugowania'); }

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { ok, bad } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) bad(new Error(message.error.message)); else ok(message.result);
});
await new Promise((ok, bad) => {
  ws.addEventListener('open', ok, { once: true });
  ws.addEventListener('error', bad, { once: true });
});
const send = (method, params, sessionId) => new Promise((ok, bad) => {
  id += 1;
  pending.set(id, { ok, bad });
  ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
});

let failed = 0;
const check = (pass, line) => { if (!pass) failed += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');

  /* `mobile: false` z tego samego powodu co w cdp.mjs: z `mobile: true` Chrome nakłada własną
     obsługę meta-viewport na wymuszone metryki i szerokość CSS wychodzi inna niż zamówiona. */
  const metrics = (height) => call('Emulation.setDeviceMetricsOverride', {
    width: 390, height, deviceScaleFactor: 1, mobile: false,
    screenWidth: 390, screenHeight: height, positionX: 0, positionY: 0
  });
  await metrics(TALL);
  if (!NO_TOUCH) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await call('Page.navigate', { url: ORIGIN + PAGE });
  await sleep(3400);

  /* Przewinięcie w środek strony: objaw był zgłaszany „najbardziej na dolnych sekcjach", bo
     tam nad bieżącym miejscem stoi najwięcej sekcji, których wysokość może się zmienić. */
  await evaluate('(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 4800); return 1; })()');
  await sleep(600);

  const read = () => evaluate(`(() => ({
    doc: document.documentElement.scrollHeight,
    inner: window.innerHeight,
    y: Math.round(window.scrollY),
    screenH: getComputedStyle(document.documentElement).getPropertyValue('--screen-h').trim(),
    touchPoints: navigator.maxTouchPoints,
    parts: [...document.querySelectorAll('#main > section, .stack-card, .site-footer')]
      .map((el) => (el.id || el.className.split(' ')[0]) + '=' + Math.round(el.getBoundingClientRect().height))
  }))()`);

  const settle = NO_TOUCH ? 900 : 500;
  const rows = [{ label: 'start (pasek schowany)', ...(await read()) }];
  for (let cycle = 1; cycle <= 4; cycle += 1) {
    await metrics(SHORT);
    await sleep(settle);
    rows.push({ label: `cykl ${cycle}: pasek widoczny`, ...(await read()) });
    await metrics(TALL);
    await sleep(settle);
    rows.push({ label: `cykl ${cycle}: pasek schowany`, ...(await read()) });
  }

  console.log(`${PAGE}  ${NO_TOUCH ? 'bez dotyku (komputer)' : 'z dotykiem (telefon)'}\n`);
  console.log('stan'.padEnd(28), 'dokument', ' okno', '     y', '--screen-h');
  for (const row of rows) {
    console.log(
      row.label.padEnd(28),
      String(row.doc).padStart(8),
      String(row.inner).padStart(5),
      String(row.y).padStart(6),
      String(row.screenH || '(brak)').padStart(10)
    );
  }

  const docs = rows.map((r) => r.doc);
  const spread = Math.max(...docs) - Math.min(...docs);
  const ys = rows.map((r) => r.y);
  const drift = Math.max(...ys) - Math.min(...ys);

  console.log('');
  if (NO_TOUCH) {
    check(rows[0].touchPoints === 0, `przegladarka bez dotyku (maxTouchPoints=${rows[0].touchPoints})`);
    /* Na komputerze zmiana wysokosci okna JEST prawdziwa i ma zostac przyjeta — inaczej
       przeciagniecie dolnej krawedzi zostawialoby sekcje wyzsze albo nizsze od okna. */
    check(rows[1].screenH === `${SHORT}px`,
      `zmiana okna przyjeta po chwili: --screen-h = ${rows[1].screenH}`);
    check(rows[2].screenH === `${TALL}px`,
      `powrot okna tez przyjety: --screen-h = ${rows[2].screenH}`);
  } else {
    check(rows[0].touchPoints > 0, `emulacja dotyku wlaczona (maxTouchPoints=${rows[0].touchPoints})`);
    check(rows.every((r) => r.screenH === rows[0].screenH),
      `--screen-h nie rusza sie przy pasku adresu: ${rows[0].screenH}`);
    check(spread === 0, `wysokosc dokumentu bez zmian przez cztery cykle paska (rozrzut ${spread} px)`);
    check(drift === 0, `pozycja przewijania nie dryfuje (rozrzut ${drift} px)`);

    if (spread !== 0) {
      console.log('\nco sie jeszcze rusza:');
      rows[0].parts.forEach((part, index) => {
        if (part !== rows[1].parts[index]) console.log(`  ${part}  ->  ${rows[1].parts[index]}`);
      });
    }
  }

  console.log(`\n${failed ? `${failed} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = failed ? 1 : 0;
} finally {
  try { ws.close(); } catch { /* zamykamy i tak */ }
  child.kill();
}
