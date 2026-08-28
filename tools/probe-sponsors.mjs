/**
 * Czy pasek sponsorów w ogóle się pokazuje — i gdzie.
 *
 *     node tools/probe-sponsors.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   „Nie widzę sponsorów" ma trzy różne przyczyny i wyglądają identycznie: nie ma ich
 *   w ustawieniach, są ale pasek jest ukryty, albo są i pasek jest widoczny, tylko stoi
 *   w miejscu, w którym nikt nie patrzy. Ta sonda odpowiada, która z trzech.
 *
 *   Sprawdza dwa warianty naraz: bez parametru (stan produkcyjny) i z ?demo=1 (cztery
 *   logotypy z demo-content.js), bo tylko porównanie mówi, czy problem jest w danych, czy
 *   w renderowaniu.
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
  const out = { errors: [], demoMode: new URLSearchParams(location.search).has('demo') };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2500);

  const band = document.querySelector('[data-sponsor-band]');
  const track = document.querySelector('[data-sponsor-track]');
  if (!band) {
    out.errors.push('brak elementu paska sponsorow');
  } else {
    const logos = [...document.querySelectorAll('.sponsor-logo')];
    const images = logos.map((l) => l.querySelector('img')).filter(Boolean);
    band.scrollIntoView();
    await sleep(300);
    const rect = band.getBoundingClientRect();
    out.band = {
      hidden: band.hidden,
      display: getComputedStyle(band).display,
      opacity: getComputedStyle(band).opacity,
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      // W ktorej sekcji naprawde siedzi.
      parentSection: band.closest('section')?.id || '(poza sekcja)',
      logos: logos.length,
      // Zaladowane obrazki, nie tylko obecne tagi: zly adres daje tag bez pikseli.
      loaded: images.filter((i) => i.complete && i.naturalWidth > 0).length,
      sources: images.slice(0, 4).map((i) => i.getAttribute('src'))
    };
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-sponsors-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__sponsorprobe.html';
writeFileSync(probeFile, html, 'utf8');

function run(query) {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=30000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__sponsorprobe.html${query}`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) return null;
  return JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

try {
  for (const [label, query] of [['bez parametru', '?skipIntro=1'], ['z ?demo=1', '?skipIntro=1&demo=1']]) {
    const r = run(query);
    console.log(`--- ${label} ---`);
    if (!r) { console.log('sonda nie wystartowała\n'); continue; }
    if (r.errors.length) console.log(`błędy: ${r.errors.join(' | ')}`);
    if (r.band) {
      const b = r.band;
      console.log(`  ukryty: ${b.hidden}   display: ${b.display}   krycie: ${b.opacity}`);
      console.log(`  rozmiar: ${b.width}x${b.height} px   w sekcji: #${b.parentSection}`);
      console.log(`  logotypy w DOM: ${b.logos}   wczytane obrazki: ${b.loaded}`);
      if (b.sources.length) console.log(`  adresy: ${b.sources.join(', ')}`);
    }
    console.log('');
  }
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
