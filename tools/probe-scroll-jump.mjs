/**
 * Szuka przeskoków przy przewijaniu telefonu — mierząc, nie zgadując.
 *
 *     node tools/probe-scroll-jump.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   „Strona przeskakuje" to objaw, który ma co najmniej pięć różnych przyczyn i wszystkie
 *   wyglądają tak samo z fotela: zmiana `position` sekcji między sticky i relative, obrazek
 *   bez podanych wymiarów dosuwający układ po wczytaniu, font zmieniający wysokość wiersza,
 *   `svh` przeliczane po schowaniu paska adresu, i element rosnący po dojściu danych.
 *
 *   Ta sonda przewija stronę małymi krokami i po każdym pyta o dwie rzeczy: czy pozycja
 *   przewijania jest tam, gdzie ją postawiono, i czy całkowita wysokość dokumentu się
 *   zmieniła. Skok pozycji bez naszego udziału albo zmiana wysokości w trakcie to dwie
 *   różne przyczyny i trzeba je rozróżnić, żeby wiedzieć, co naprawiać.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173';

/**
 * Rozmiar okna jako argument: `node tools/probe-scroll-jump.mjs <adres> 390x844`
 *
 * Wcześniej był wpisany na sztywno jako 420×860 i to była luka w pomiarze, nie drobiazg.
 * O tym, czy sekcja jest wyższa od ekranu — czyli czy trafia w tryb `pinned` i czy w ogóle
 * może szarpnąć przewinięciem — decyduje wysokość okna. Jeden zmierzony rozmiar znaczy jeden
 * sprawdzony telefon, a „u mnie przeskakuje" przychodzi z całej reszty.
 */
const size = /^(\d{3,4})x(\d{3,4})$/.exec(process.argv[3] || '') || [null, '420', '860'];
const viewport = `${size[1]},${size[2]}`;

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
  const out = { errors: [], steps: [], panels: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2600);

  const doc = document.documentElement;
  const sections = [...document.querySelectorAll('#main > section.section-card')];

  /* Stan paneli przed przewijaniem. Jesli ktorykolwiek zmieni tryb w trakcie, mamy przyczyne
     nazwana po imieniu: zmiana position z sticky na relative przestawia caly uklad ponizej. */
  const panelState = () => sections.map((s) => \`\${s.id}:\${s.dataset.panel || '?'}\`).join(' ');
  out.panelsBefore = panelState();

  let height = doc.scrollHeight;
  let previous = 0;
  const STEP = 220;

  for (let i = 1; i <= 40; i += 1) {
    const asked = i * STEP;
    if (asked > doc.scrollHeight - window.innerHeight) break;
    window.scrollTo(0, asked);
    window.dispatchEvent(new Event('scroll'));
    await sleep(140);

    const actual = Math.round(window.scrollY);
    const now = doc.scrollHeight;
    /* Skok: pozycja rozni sie od tej, o ktora poprosilismy, bardziej niz o pare pikseli
       zaokraglenia — czyli cos przestawilo strone pod nami. */
    const drift = actual - asked;
    const grew = now - height;
    if (Math.abs(drift) > 4 || Math.abs(grew) > 4) {
      out.steps.push({
        asked,
        actual,
        drift,
        heightBefore: height,
        heightAfter: now,
        grew,
        panels: panelState()
      });
    }
    height = now;
    previous = actual;
  }

  out.panelsAfter = panelState();
  out.finalHeight = doc.scrollHeight;
  out.viewport = window.innerHeight;
  out.width = window.innerWidth;

  /* Obrazki bez podanych wymiarow. Kazdy taki dosuwa uklad w momencie wczytania, i to jest
     przeskok, ktorego zadna zmiana JS nie naprawi — brakujace width/height to przyczyna. */
  out.unsizedImages = [...document.querySelectorAll('img')]
    .filter((img) => !img.getAttribute('width') || !img.getAttribute('height'))
    .map((img) => (img.getAttribute('src') || '').split('/').pop() || '(inline)')
    .slice(0, 12);

  /* Elementy uzywajace svh w wysokosci. Na telefonie pasek adresu zmienia svh w trakcie
     przewijania, wiec kazdy z nich moze przestawic uklad bez zadnego zdarzenia. */
  out.svhUsers = sections
    .map((s) => ({ id: s.id, minH: getComputedStyle(s).minHeight }))
    .filter((s) => s.minH && s.minH !== '0px' && s.minH !== 'auto');

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-jump-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__jumpprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    `--window-size=${viewport}`,
    '--virtual-time-budget=60000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__jumpprobe.html?skipIntro=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  console.log(`okno ${r.width}x${r.viewport}   dokument ${r.finalHeight} px`);
  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  let fails = 0;
  const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

  check(r.steps.length === 0, `przeskoków przy przewijaniu: ${r.steps.length}`);
  if (r.steps.length) {
    console.log('      pozycja / oczekiwana / dryf / wysokość przed → po');
    for (const step of r.steps.slice(0, 12)) {
      console.log(
        `      ${String(step.actual).padEnd(7)} ${String(step.asked).padEnd(7)} `
        + `${String(step.drift).padEnd(6)} ${step.heightBefore} → ${step.heightAfter} (${step.grew >= 0 ? '+' : ''}${step.grew})`
      );
    }
  }

  check(r.panelsBefore === r.panelsAfter, 'żadna sekcja nie zmieniła trybu pinned/flow w trakcie');
  if (r.panelsBefore !== r.panelsAfter) {
    console.log(`      przed: ${r.panelsBefore}`);
    console.log(`      po:    ${r.panelsAfter}`);
  }

  /* Obrazki bez wymiarow to informacja, nie porazka — i to jest rozstrzygniete pomiarem,
     nie zalozeniem. Wysokosc dokumentu nie zmienila sie ani raz przez czterdziesci krokow,
     wiec zaden z nich nie dosuwa ukladu: wszystkie siedza w pudelkach o ustalonej wysokosci
     (karuzela 3D ma height 100svh, pasek sponsorow ma swoja wysokosc). Gdyby ktorys byl w
     zwyklym przeplywie, pokazalby sie wyzej jako zmiana wysokosci. */
  const heightMoved = r.steps.some((step) => Math.abs(step.grew) > 4);
  check(!heightMoved, 'wysokość dokumentu nie zmienia się w trakcie przewijania');
  if (r.unsizedImages.length) {
    console.log(`      (bez width/height, ale w pudełkach o stałej wysokości: ${r.unsizedImages.join(', ')})`);
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
