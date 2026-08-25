/**
 * Asks a real browser whether the text effects actually ran.
 *
 * Written because the alternative was guessing at CSS. Loads the built page in headless
 * Chrome, scrolls each animated heading into view, and reports what the DOM and the
 * computed styles say: whether the spans were created, whether `is-playing` was added,
 * and what opacity the first character ended up at.
 *
 *     node tools/probe-text-effects.mjs            (needs vite preview on :4177)
 *     node tools/probe-text-effects.mjs http://localhost:5173
 *
 * Uses Chrome's DevTools protocol over a websocket-free path: --dump-dom cannot run
 * script after load, so this drives the page with --virtual-time-budget and a script
 * injected through a temporary HTML wrapper is not possible either. Instead it uses
 * Chrome's built-in `--headless --print-to-pdf`-style one-shot evaluation via
 * `--dump-dom` after a long virtual time budget, which is enough: the effects run on
 * DOMContentLoaded and on intersection, and the wrapper below scrolls the page first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.argv[2] || 'http://localhost:4177/';

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Chrome or Edge not found.');
  return found;
}

/* A wrapper page that loads the real one in an iframe would be blocked by the gate and
   by same-origin reads. Instead the probe is appended to the page itself through a
   userscript-shaped trick: Chrome's --dump-dom returns the DOM *after* load, so all the
   probe has to do is be part of the page. It is injected by asking Chrome to open a
   data: URL that redirects — which does not work either.

   So: the probe below runs as part of the page because it is written into a copy of
   dist/index.html. That copy lives in a temp dir and is served by the same preview
   server through a query string it ignores. Simpler than it sounds: fetch the HTML,
   append a script, write it next to the original so relative asset paths still resolve. */
const profile = mkdtempSync(join(tmpdir(), 'car-probe-'));

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1200);
  const out = [];
  for (const el of document.querySelectorAll('[data-text-effect]')) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    // Long enough for the observer, then the 2.5 s fallback, then the animation itself.
    // The question this answers is not "did it start" but "is the text readable at the
    // end", which is the thing that was broken.
    for (let wait = 0; wait < 45 && !el.classList.contains('is-playing'); wait += 1) await sleep(100);
    await sleep(1400);
    const unit = el.querySelector('.fx-unit');
    const style = unit ? getComputedStyle(unit) : null;
    const box = el.getBoundingClientRect();

    // A fresh observer with the same options, to see what the browser actually reports
    // for this element right now. If this says false while the element is plainly on
    // screen, the options are wrong; if it says true, the original observer never ran.
    const seen = await new Promise((resolve) => {
      const io = new IntersectionObserver((records) => {
        io.disconnect();
        resolve({ hit: records[0].isIntersecting, ratio: Number(records[0].intersectionRatio.toFixed(3)) });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
      io.observe(el);
      setTimeout(() => { io.disconnect(); resolve({ hit: 'timeout', ratio: -1 }); }, 400);
    });

    out.push({
      id: el.id || '(no id)',
      effect: el.dataset.textEffect,
      units: el.querySelectorAll('.fx-unit').length,
      words: el.querySelectorAll('.fx-word').length,
      playing: el.classList.contains('is-playing'),
      opacity: style ? style.opacity : null,
      animation: style ? style.animationName : null,
      rect: Math.round(box.width) + 'x' + Math.round(box.height) + ' @top ' + Math.round(box.top),
      io: seen.hit + '/' + seen.ratio
    });
  }
  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    cssLoaded: [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => String(rule.cssText).includes('fx-rise')); }
      catch (_) { return false; }
    }),
    headings: out
  }, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const response = await fetch(target);
if (!response.ok) throw new Error(`preview server answered ${response.status} for ${target}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

/* Served from the same origin so every relative path in the page still resolves: the
   file is written into dist/ under a name that is not committed. */
const probeFile = 'dist/__probe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    // Six headings, each waiting for the fallback timer and then the animation. Generous
    // on purpose: a probe that times out reports "did not run", which reads like a bug.
    '--virtual-time-budget=90000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    new URL('/__probe.html', target).toString()
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Probe did not run. The page may not have loaded; first 400 chars of DOM:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const decoded = match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const result = JSON.parse(decoded);

  console.log(`reduced motion: ${result.reducedMotion}`);
  console.log(`text-effects.css loaded: ${result.cssLoaded}\n`);
  for (const heading of result.headings) {
    console.log(
      `${heading.id.padEnd(16)} ${String(heading.effect).padEnd(5)} `
      + `units=${String(heading.units).padEnd(4)} words=${String(heading.words).padEnd(3)} `
      + `playing=${String(heading.playing).padEnd(5)} opacity=${String(heading.opacity).padEnd(4)} `
      + `anim=${String(heading.animation).padEnd(8)} rect=${String(heading.rect).padEnd(22)} io=${heading.io}`
    );
  }
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
