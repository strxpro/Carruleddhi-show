/**
 * Checks that demo mode fills the wall and the sponsor band, and that it says so on screen.
 *
 *     node tools/probe-demo.mjs        (needs vite preview on :4179)
 *
 * Two things worth proving rather than assuming. First that `?demo=1` actually produces
 * tiles and logos — a demo that renders nothing is indistinguishable from a demo that was
 * never wired up. Second that the banner and the per-tile DEMO marks are present, because
 * they are the whole reason this is safe to have at all.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://localhost:4179';

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

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  /* Long enough for the wall's 6-second fallback timer.
     The list is normally loaded by an IntersectionObserver when the section gets close, and
     observer callbacks do not fire under a headless virtual clock — which is exactly why
     that fallback exists, and why waiting for it here is testing the thing that matters. */
  await sleep(8000);

  out.demoClass = document.documentElement.classList.contains('is-demo');
  out.banner = (document.querySelector('.demo-banner') || {}).textContent || '';

  const notes = [...document.querySelectorAll('.wall-note')];
  out.comments = notes.length;
  out.firstComment = notes.length ? notes[0].querySelector('.wall-note__text').textContent.slice(0, 60) : '';
  out.starsOnFirst = notes.length ? notes[0].querySelectorAll('[class*=star]').length : 0;

  const score = document.querySelector('[data-wall-score]');
  out.scoreVisible = score ? !score.hidden : null;
  out.scoreValue = (document.querySelector('[data-wall-score-value]') || {}).textContent || '';
  out.scoreVotes = (document.querySelector('[data-wall-score-votes]') || {}).textContent || '';

  const bar = document.querySelector('[data-wall-sortbar]');
  out.sortBarVisible = bar ? !bar.hidden : null;
  out.sortButtons = [...document.querySelectorAll('[data-wall-sort]')].map((b) => b.textContent.trim());

  // Press "best rated" and see whether the first tile changes to a five-star one.
  const best = document.querySelector('[data-wall-sort="best"]');
  if (best) {
    best.click();
    await sleep(500);
    const after = document.querySelector('.wall-note .wall-note__text');
    out.firstAfterSort = after ? after.textContent.slice(0, 60) : '';
  }

  const band = document.querySelector('[data-sponsor-band]');
  out.sponsorBandVisible = band ? !band.hidden : null;
  out.sponsorLogos = document.querySelectorAll('[data-sponsor-track] img').length;
  out.sponsorNames = [...document.querySelectorAll('[data-sponsor-track] img')]
    .map((i) => i.getAttribute('alt')).filter(Boolean);

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-demo-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview server answered ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__demoprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=30000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    // The query parameter is the whole point of the test.
    `${base}/__demoprobe.html?demo=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Probe did not run. First 400 chars:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  console.log(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
