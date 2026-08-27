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

  /* The board must not have a scrollbar of its own — a scrolling box inside a scrolling page
     means the wrong thing moves depending on where a thumb lands. */
  const board = document.querySelector('.wall-board');
  const list = document.querySelector('[data-wall-list]');
  out.boardOverflowY = board ? getComputedStyle(board).overflowY : '';
  out.boardScrolls = board ? board.scrollHeight > board.clientHeight + 2 : null;
  out.listColumns = list ? getComputedStyle(list).columnCount : '';

  // "Show more" should reveal what is already loaded before asking the server for anything.
  const showMore = document.querySelector('[data-wall-more]');
  out.moreVisible = showMore ? !showMore.hidden : null;
  if (showMore && !showMore.hidden) {
    showMore.click();
    await sleep(400);
    out.commentsAfterMore = document.querySelectorAll('.wall-note').length;
    out.moreVisibleAfter = !showMore.hidden;
  }

  // The form is folded away behind a button.
  const openBtn = document.querySelector('[data-wall-open]');
  const fold = document.querySelector('[data-wall-fold]');
  out.foldClosedHeight = fold ? Math.round(fold.getBoundingClientRect().height) : null;
  if (openBtn) {
    openBtn.click();
    await sleep(600);
    out.foldOpenHeight = fold ? Math.round(fold.getBoundingClientRect().height) : null;
    out.foldAria = openBtn.getAttribute('aria-expanded');
    out.foldHasClass = fold ? fold.classList.contains('is-open') : null;
    out.foldMaxHeight = fold ? getComputedStyle(fold).maxHeight : '';
    /* The inner element carries no transition, so its height is the content's real height
       whatever the animation clock is doing. If this is large while the outer box reads 0,
       the panel is fine and the transition simply has not advanced — which is what a headless
       virtual clock does. If this is 0 too, the panel is genuinely empty. */
    const inner = fold ? fold.querySelector('.wall-fold__inner') : null;
    out.foldInnerHeight = inner ? Math.round(inner.getBoundingClientRect().height) : null;
    out.formFieldsInside = inner ? inner.querySelectorAll('input, textarea').length : 0;

    /* Settles "frozen transition" against "broken rule".
       A transition that has not advanced reports its start value from getComputedStyle, which
       is indistinguishable from a rule that never applied. Turning the transition off forces
       the final value: if max-height becomes 1400px here, the CSS is right and the headless
       animation clock was the only thing standing still. */
    if (fold) {
      fold.style.transition = 'none';
      await sleep(120);
      out.foldMaxHeightNoTransition = getComputedStyle(fold).maxHeight;
      out.foldHeightNoTransition = Math.round(fold.getBoundingClientRect().height);
    }
  }

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
