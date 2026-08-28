/**
 * Choreografia trasy na telefonie, w obie strony.
 *
 *     node tools/probe-route-mobile.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   Kolejność zdarzeń jest cała treścią tego efektu: napisy mają odjechać do góry, zdjęcie
 *   ma dojść do końca, pinezki mają się pojawić, i tylko wtedy następna sekcja ma zacząć
 *   nachodzić. Każdy z tych czterech warunków da się spełnić osobno i mieć nadal zły efekt,
 *   więc mierzone jest ich następstwo, a nie same wartości.
 *
 *   Drugi przebieg w górę, bo „i tak samo jak się idzie do góry to jest to wszystko ale od
 *   tyłu" jest wymaganiem, a nie ozdobą — i wychodzi za darmo tylko wtedy, gdy wszystko jest
 *   funkcją pozycji przewijania, a nie odtwarzaną animacją. To sprawdza, czy naprawdę jest.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173';

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
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [], width: window.innerWidth, down: [], up: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2400);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important}';
  document.head.appendChild(kill);

  const section = document.getElementById('route');
  const frame = document.querySelector('[data-route-frame]');
  const copy = document.querySelector('.route__copy');
  const next = section?.nextElementSibling;
  if (!section || !frame || !copy) {
    out.errors.push('brak sekcji trasy albo jej czesci');
  } else {
    const documentTop = (el) => { let t = 0; let n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
    out.sectionTop = documentTop(section);
    out.sectionHeight = section.offsetHeight;
    out.viewport = window.innerHeight;
    out.panel = section.dataset.panel || '';

    const read = (asked) => {
      const fs = getComputedStyle(frame);
      const m = new DOMMatrixReadOnly(fs.transform === 'none' ? '' : fs.transform);
      const startPin = document.querySelector('.route__frame .route__pin--start');
      const endPin = document.querySelector('.route__frame .route__pin--end');
      const nextRect = next ? next.getBoundingClientRect() : null;
      const frameRect = frame.getBoundingClientRect();
      const copyStyle = getComputedStyle(copy);
      const copyM = new DOMMatrixReadOnly(copyStyle.transform === 'none' ? '' : copyStyle.transform);
      /* Ile pinezki wystaja poza kadr zdjecia. Dodatnie = wychodza. To bylo widac na zrzucie
         jako "META" poza obrazkiem i to jest liczba, ktora o tym mowi. */
      const outside = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return Math.round(Math.max(0, frameRect.left - r.left, r.right - frameRect.right,
          frameRect.top - r.top, r.bottom - frameRect.bottom));
      };
      return {
        asked,
        actual: Math.round(window.scrollY),
        progress: Number(frame.style.getPropertyValue('--route-progress') || 0),
        scale: Number(m.a.toFixed(3)),
        // Kat obrotu z macierzy: b/a to tangens, wiec atan daje stopnie.
        rotate: Number((Math.atan2(m.b, m.a) * 180 / Math.PI).toFixed(2)),
        frameOpacity: Number(getComputedStyle(frame).opacity).toFixed(2),
        copyOpacity: Number(copyStyle.opacity).toFixed(3),
        // Skala tekstu: to ona ma teraz ustepowac miejsca, nie krycie.
        copyScale: Number(copyM.a.toFixed(3)),
        copyY: Number(copyM.f.toFixed(1)),
        // Zdjecie na srodku przypietego obszaru: odleglosc gornej i dolnej krawedzi od ekranu.
        frameTop: Math.round(frameRect.top),
        frameBottom: Math.round(window.innerHeight - frameRect.bottom),
        pinOutside: Math.max(outside(startPin) ?? 0, outside(endPin) ?? 0),
        // Ile pikseli nastepnej sekcji zachodzi na zdjecie. Ujemne = jeszcze nie dotarla.
        nextOverlap: nextRect ? Math.round(frameRect.bottom - nextRect.top) : null
      };
    };

    const from = out.sectionTop - out.viewport;
    const to = out.sectionTop + out.sectionHeight;
    const stops = [];
    for (let i = 0; i <= 10; i += 1) stops.push(Math.max(0, Math.round(from + ((to - from) * i) / 10)));

    for (const y of stops) {
      window.scrollTo(0, y);
      window.dispatchEvent(new Event('scroll'));
      await sleep(200);
      out.down.push(read(y));
    }
    for (const y of [...stops].reverse()) {
      window.scrollTo(0, y);
      window.dispatchEvent(new Event('scroll'));
      await sleep(200);
      out.up.push(read(y));
    }
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-routem-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__routemobile.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=420,860',
    '--virtual-time-budget=60000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__routemobile.html?skipIntro=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  console.log(`okno ${r.width} px   sekcja ${r.sectionHeight} px / ekran ${r.viewport} px   panel="${r.panel}"`);
  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  console.log('W DÓŁ');
  console.log('scroll   postęp  skalaZ obrót   kryZ  kryT  skalaT  góra dół  pinPoza zachodz');
  for (const s of r.down) {
    console.log(
      `${String(s.actual).padEnd(8)} ${String(s.progress).padEnd(7)} ${String(s.scale).padEnd(6)} `
      + `${String(s.rotate).padEnd(7)} ${String(s.frameOpacity).padEnd(5)} ${String(s.copyOpacity).padEnd(5)} `
      + `${String(s.copyScale).padEnd(7)} ${String(s.frameTop).padEnd(4)} ${String(s.frameBottom).padEnd(4)} `
      + `${String(s.pinOutside).padEnd(7)} ${s.nextOverlap}`
    );
  }

  let fails = 0;
  const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };
  console.log('');

  const scales = r.down.map((s) => s.scale);
  const grew = Math.max(...scales) - Math.min(...scales);
  check(grew > 0.2, `zdjęcie rośnie o ${(grew * 100).toFixed(0)}% skali (${Math.min(...scales)} → ${Math.max(...scales)})`);

  const rotates = new Set(r.down.map((s) => s.rotate));
  check(rotates.size > 1, `obrót się zmienia i wyrównuje: ${[...rotates].join(', ')}°`);

  /* Tekst ma ustępować rozmiarem, nie widocznością. Oba warunki naraz, bo pierwsza wersja
     spełniała drugi (gasła do 0.06) i to był właśnie zgłoszony błąd. */
  const copyOpacities = r.down.map((s) => Number(s.copyOpacity));
  check(Math.min(...copyOpacities) > 0.9,
    `tekst nie gaśnie: krycie ${Math.max(...copyOpacities)} → ${Math.min(...copyOpacities)}`);
  const copyScales = r.down.map((s) => s.copyScale);
  check(Math.min(...copyScales) < 0.85,
    `tekst maleje, robiąc miejsce: skala ${Math.max(...copyScales)} → ${Math.min(...copyScales)}`);

  const frameOpacities = r.down.map((s) => Number(s.frameOpacity));
  check(Math.min(...frameOpacities) > 0.99,
    `zdjęcie nigdzie nie jest przygaszone: krycie ${Math.min(...frameOpacities)}`);

  // Kończy większe niż jeden, czyli faktycznie „wychodzi" ze swojego pudełka na środek.
  check(Math.max(...scales) > 1,
    `zdjęcie kończy powiększone: ${Math.max(...scales)}`);

  const outside = Math.max(...r.down.map((s) => s.pinOutside));
  check(outside === 0, `pinezki nie wychodzą poza kadr (najwięcej ${outside} px)`);

  /* Najważniejsze: zdjęcie ma skończyć, zanim następna sekcja zacznie zachodzić. */
  const doneAt = r.down.findIndex((s) => s.progress >= 0.999);
  const overlapAt = r.down.findIndex((s) => (s.nextOverlap ?? -1) > 0);
  check(doneAt >= 0 && (overlapAt === -1 || overlapAt >= doneAt),
    `następna sekcja nachodzi dopiero po zakończeniu (koniec na kroku ${doneAt}, zachodzenie na ${overlapAt})`);

  /* W górę te same wartości dla tych samych pozycji — czyli efekt jest funkcją przewijania,
     a nie odtworzoną raz animacją. */
  const byScroll = new Map(r.down.map((s) => [s.actual, s]));
  const mismatched = r.up.filter((s) => {
    const twin = byScroll.get(s.actual);
    return twin && Math.abs(twin.scale - s.scale) > 0.02;
  });
  check(mismatched.length === 0,
    `w górę dokładnie od tyłu: ${r.up.length - mismatched.length} z ${r.up.length} pozycji zgodnych`);

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
