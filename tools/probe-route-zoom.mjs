/**
 * Proves the route photograph actually changes size as the page scrolls.
 *
 *     node tools/probe-route-zoom.mjs        (needs vite preview on :4177)
 *
 * WHY THIS EXISTS
 *   The first version of this animation used getBoundingClientRect() and looked finished in
 *   the code. It was not: #route is a sticky panel, so `rect.top` stops at 0 once it pins and
 *   the progress value jumped to 1 before the picture was on screen. Nothing about that is
 *   visible from reading the source, and "it does not zoom" is all the report you get back.
 *
 *   So this scrolls the real page to a series of positions and reads the real matrix off the
 *   real element. A run where every scale is identical means the animation is not happening,
 *   whatever the code says.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4177';

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
  const out = { errors: [], samples: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2000);

  const frame = document.querySelector('[data-route-frame]');
  const section = document.getElementById('route');
  if (!frame || !section) {
    out.errors.push('route frame or section missing');
  } else {
    const documentTop = (el) => { let t = 0; let n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
    out.sectionTop = documentTop(section);
    out.sectionHeight = section.offsetHeight;
    out.viewport = window.innerHeight;
    out.panelMode = section.dataset.panel || '';

    // Nine stops from a screen before the section to a screen past it. Enough to see whether
    // the value moves at all, and whether it moves monotonically rather than snapping.
    const from = out.sectionTop - out.viewport;
    const to = out.sectionTop + out.sectionHeight;
    for (let i = 0; i <= 8; i += 1) {
      const y = Math.max(0, Math.round(from + ((to - from) * i) / 8));
      window.scrollTo(0, y);
      /* Dispatched by hand as well as scrolled.
         Under a headless virtual clock the browser does not always deliver the scroll event
         that a programmatic scrollTo would normally produce — the same class of problem as
         the IntersectionObserver callbacks that never fired in the other probes. Asking for
         the measurement explicitly separates "the maths is wrong" from "the event never
         arrived", which are two very different bugs. */
      window.dispatchEvent(new Event('scroll'));
      await sleep(260);
      const style = getComputedStyle(frame);
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? '' : style.transform);
      out.samples.push({
        asked: y,
        // What the page actually did. If this stays 0 the probe never scrolled and every
        // other number in the row is meaningless.
        actual: Math.round(window.scrollY),
        progress: frame.style.getPropertyValue('--route-progress').trim(),
        scale: Number(matrix.a.toFixed(4)),
        translateY: Number(matrix.f.toFixed(1))
      });
    }
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-zoom-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview server answered ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__zoomprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=40000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__zoomprobe.html?skipIntro=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Probe did not run. First 400 chars:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const result = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  console.log(`section top ${result.sectionTop}  height ${result.sectionHeight}  viewport ${result.viewport}  panel="${result.panelMode}"`);
  console.log(`errors: ${result.errors.length ? result.errors.join(' | ') : 'none'}\n`);
  console.log('asked     actual    progress   scale    translateY');
  for (const sample of result.samples) {
    console.log(
      `${String(sample.asked).padEnd(9)} ${String(sample.actual).padEnd(9)} `
      + `${String(sample.progress).padEnd(10)} ${String(sample.scale).padEnd(8)} ${sample.translateY}`
    );
  }
  if (result.samples.every((sample) => sample.actual === 0)) {
    console.log('\nThe probe never scrolled — every reading below is meaningless.');
  }

  const scales = result.samples.map((s) => s.scale);
  const moved = Math.max(...scales) - Math.min(...scales);
  console.log(`\nscale travelled: ${moved.toFixed(4)}  ${moved > 0.01 ? 'OK' : 'FAIL — the picture is not resizing'}`);
  process.exit(moved > 0.01 ? 0 : 1);
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
