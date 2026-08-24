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
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
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
      `--remote-debugging-port=${PORT}`,
      // A fresh profile every run: a persisted localStorage made the attendance
      // button arrive already pressed and silently voided the next measurement.
      `--user-data-dir=${resolve(root, 'node_modules/.cdp-profile-' + Date.now())}`,
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
    return await fn(call, logs);
  } finally {
    try { cdp.ws.close(); } catch { /* closing anyway */ }
    child.kill();
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
