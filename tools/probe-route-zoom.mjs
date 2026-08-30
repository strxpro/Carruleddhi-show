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
        /* Wartość WYLICZONA, nie inline. app.js pisze `--route-progress` na `#route`, a ramka
           ją dziedziczy — patrz blok przy `@property` w route-zoom.css. Odczyt z
           `frame.style` zwracałby więc pustkę i sonda raportowałaby zero przy działającym
           efekcie. `getComputedStyle` daje tę samą liczbę bez względu na to, który element ją
           nosi, więc jest też odporny na kolejną taką przenosinę. */
        progress: getComputedStyle(frame).getPropertyValue('--route-progress').trim(),
        scale: Number(matrix.a.toFixed(4)),
        translateY: Number(matrix.f.toFixed(1)),
        /* The rest of the choreography, read the same way and for the same reason: the cart
           riding the road and the copy stepping back are both driven off this one number, and
           "the copy does not move" looks identical in the source whether the property never
           reached the section or the stylesheet never read it. */
        cart: (() => {
          const cart = document.querySelector('[data-route-cart]');
          if (!cart) return null;
          return {
            left: cart.style.left || '(nie ustawiono)',
            top: cart.style.top || '(nie ustawiono)',
            opacity: Number(getComputedStyle(cart).opacity).toFixed(2)
          };
        })(),
        copyOpacity: (() => {
          const copy = document.querySelector('.route__copy');
          return copy ? Number(getComputedStyle(copy).opacity).toFixed(2) : null;
        })(),
        /* Skala tekstu, bo to ona ustepuje miejsca zdjeciu. Wczesniej mierzone bylo krycie —
           tekst gasl do 42% i to bylo zglaszane jako „wszystko przygaszone". Teraz krycie ma
           stac na 1 i to jest osobna asercja nizej. */
        copyScale: (() => {
          const copy = document.querySelector('.route__copy');
          if (!copy) return null;
          const style = getComputedStyle(copy).transform;
          return Number(new DOMMatrixReadOnly(style === 'none' ? '' : style).a.toFixed(3));
        })(),
        // Co naprawde odziedziczyl tekst. Rozjazd miedzy tym a kolumna "progress" znaczy, ze
        // wlasciwosc nie doszla do sekcji; zgodnosc znaczy, ze to arkusz jej nie czyta.
        sectionProgress: getComputedStyle(document.querySelector('.route__copy'))
          .getPropertyValue('--route-progress').trim(),
        copyTransform: getComputedStyle(document.querySelector('.route__copy')).transform,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        /* Kto naprawde ustawia krycie na tym elemencie. Trzy razy pod rzad zgadywalem zle
           (will-change, inherytancja, :root), wiec zamiast czwartej hipotezy - lista
           wszystkich pasujacych regul z opacity, plus styl inline i aktywne animacje. */
        opacityRules: (() => {
          const el = document.querySelector('.route__copy');
          const found = [];
          for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch (_) { continue; }
            const walk = (list, media) => {
              for (const rule of list) {
                if (rule.cssRules) { walk(rule.cssRules, rule.conditionText || media); continue; }
                if (!rule.selectorText || !rule.style) continue;
                if (!rule.style.opacity && !rule.style.animation && !rule.style.animationName) continue;
                let matches = false;
                try { matches = el.matches(rule.selectorText); } catch (_) { matches = false; }
                if (matches) {
                  found.push({
                    sel: rule.selectorText,
                    opacity: rule.style.opacity || '',
                    anim: rule.style.animationName || rule.style.animation || '',
                    media: media || ''
                  });
                }
              }
            };
            walk(rules, '');
          }
          return {
            rules: found,
            inline: el.style.opacity || '(brak)',
            animations: (el.getAnimations ? el.getAnimations() : []).map((a) => a.animationName || 'transition')
          };
        })()
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
  console.log('asked     actual    progress   scale    transY  copy   wozek(left/top/krycie)');
  for (const sample of result.samples) {
    const cart = sample.cart
      ? `${sample.cart.left} / ${sample.cart.top} / ${sample.cart.opacity}`
      : '(brak elementu)';
    console.log(
      `${String(sample.asked).padEnd(9)} ${String(sample.actual).padEnd(9)} `
      + `${String(sample.progress).padEnd(10)} ${String(sample.scale).padEnd(8)} `
      + `${String(sample.translateY).padEnd(7)} ${String(sample.copyOpacity).padEnd(6)} `
      + `${String(sample.sectionProgress).padEnd(7)} ${cart}`
    );
  }

  /* Trzy osobne asercje, bo trzy osobne rzeczy mogą nie działać niezależnie od siebie. */
  const carts = result.samples.map((s) => s.cart).filter(Boolean);
  const cartMoved = new Set(carts.map((c) => `${c.left}|${c.top}`)).size > 1;
  const copyScales = result.samples.map((s) => s.copyScale).filter((value) => value !== null);
  const copyRecedes = new Set(copyScales).size > 1 && Math.min(...copyScales) < 0.92;
  const opacities = result.samples.map((s) => Number(s.copyOpacity));
  const copyStaysLit = opacities.every((value) => value > 0.95);
  console.log('');
  console.log(`${cartMoved ? 'ok  ' : 'FAIL'}  wózek jedzie po trasie (różnych pozycji: ${new Set(carts.map((c) => c.left)).size})`);
  console.log(`${copyRecedes ? 'ok  ' : 'FAIL'}  tekst ustępuje miejsca rozmiarem: skala ${Math.max(...copyScales)} → ${Math.min(...copyScales)}`);
  console.log(`${copyStaysLit ? 'ok  ' : 'FAIL'}  i nie gaśnie: krycie ${Math.min(...opacities)} → ${Math.max(...opacities)}`);
  console.log(`      reduced-motion w przeglądarce: ${result.samples[0]?.reduced}`);
  console.log(`      transform tekstu: ${result.samples[0]?.copyTransform} ... ${result.samples.at(-1)?.copyTransform}`);
  const diag = result.samples[0]?.opacityRules;
  if (diag) {
    console.log(`      krycie inline: ${diag.inline}   animacje: ${diag.animations.join(', ') || 'brak'}`);
    console.log('      reguły ustawiające krycie na .route__copy:');
    for (const rule of diag.rules) {
      console.log(`        ${rule.sel}  ->  opacity: ${rule.opacity || '-'}  anim: ${rule.anim || '-'}  ${rule.media ? `@media ${rule.media}` : ''}`);
    }
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
