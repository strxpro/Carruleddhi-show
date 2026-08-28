/**
 * Czy werdykt „przypiąć czy puścić w przewijanie" zależy od paska adresu?
 *
 *     npm run build && npx vite preview --port 4173
 *     node tools/probe-urlbar-jump.mjs http://127.0.0.1:4173
 *
 * OBJAW, KTÓREGO DOTYCZY
 *   Sekcja przypięta to `position: sticky`, puszczona to `position: relative`. Przełączenie
 *   między nimi przestawia sekcję w układzie i przesuwa wszystko pod nią — czyli szarpie
 *   stroną pod palcem. Jeżeli werdykt zależy od bieżącej wysokości okna, a ta na telefonie
 *   zmienia się o 60–100 px przy każdym schowaniu paska adresu, to szarpnięcie przychodzi
 *   w losowych momentach przewijania.
 *
 * DLACZEGO NIE DA SIĘ TEGO ZMIERZYĆ PRZEZ SAMĄ ZMIANĘ ROZMIARU OKNA
 *   Pierwsza wersja tej sondy uruchamiała stronę w kilku wysokościach okna i porównywała
 *   werdykty. Przechodziła — ale przechodziła też **z zepsutym kodem**, więc nie mierzyła
 *   niczego. Powód: w headless Chrome nie ma paska adresu, więc `100svh` i
 *   `window.innerHeight` są tą samą liczbą i nie sposób ich rozróżnić.
 *
 *   Zielona sonda, która świeci tak samo przed naprawą i po niej, jest gorsza od jej braku:
 *   wygląda na dowód. Ten sam błąd rozumowania kazał wcześniej dwa razy uznać przeskakiwanie
 *   za rozwiązane.
 *
 * CO ROBI TA WERSJA
 *   Podstawia `window.innerHeight` zwracające wartość o 78 px większą niż prawdziwa — czyli
 *   dokładnie to, co robi schowany pasek adresu — i sprawdza, czy którakolwiek sekcja
 *   zmieniła `data-panel`. `100svh` zostaje przy tym nietknięte, bo jest jednostką CSS.
 *
 *   Jeżeli kod liczy względem `svh`, werdykty są identyczne. Jeżeli względem `innerHeight`,
 *   któraś sekcja stojąca blisko granicy jednego ekranu przeskoczy — i to jest ten błąd.
 *
 *   Podmiana wchodzi przez kopię `index.html` z dodanym skryptem w `<head>`, zapisaną obok
 *   oryginału w `dist/`. Serwer podglądu i tak serwuje ten katalog, więc nie trzeba drugiego.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Nie znalazlem Chrome ani Edge.');
  return found;
}

/* O tyle rusza wysokość okna chowający się pasek adresu na typowym Androidzie. */
const URL_BAR = 78;

const stub = `<script>
  (function () {
    var real = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { get: function () { return real + ${URL_BAR}; } });
  })();
</script>`;

const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.log('BLAD  brak dist/index.html — uruchom najpierw `npm run build`');
  process.exit(1);
}

const probeName = '__probe-urlbar.html';
const probePath = join(dist, probeName);
const html = readFileSync(indexPath, 'utf8');
if (!html.includes('<head>')) {
  console.log('BLAD  nie znalazlem <head> w dist/index.html');
  process.exit(1);
}
writeFileSync(probePath, html.replace('<head>', `<head>\n${stub}`), 'utf8');

function verdicts(url) {
  const profile = mkdtempSync(join(tmpdir(), 'carr-urlbar-'));
  try {
    const output = execFileSync(chromePath(), [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--window-size=500,765',
      '--virtual-time-budget=5000', '--dump-dom', url
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });

    const found = new Map();
    for (const re of [
      /<section[^>]*\bid="([a-z-]+)"[^>]*\bdata-panel="([a-z]+)"/g,
      /<section[^>]*\bdata-panel="([a-z]+)"[^>]*\bid="([a-z-]+)"/g
    ]) {
      const idFirst = re.source.indexOf('id=') < re.source.indexOf('data-panel');
      for (const m of output.matchAll(re)) found.set(idFirst ? m[1] : m[2], idFirst ? m[2] : m[1]);
    }
    return [...found.entries()].sort(([a], [b]) => a.localeCompare(b));
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

try {
  const real = verdicts(`${base}/`);
  const stubbed = verdicts(`${base}/${probeName}`);

  if (!real.length) {
    console.log('BLAD  zadna sekcja nie ma data-panel — sonda nie mierzy tego, co powinna');
    process.exit(1);
  }

  console.log('');
  console.log(`prawdziwe innerHeight   ${real.map(([id, v]) => id + ':' + v).join('  ')}`);
  console.log(`innerHeight +${URL_BAR} px     ${stubbed.map(([id, v]) => id + ':' + v).join('  ')}`);
  console.log('');

  const before = new Map(real);
  const changed = stubbed.filter(([id, verdict]) => before.get(id) !== verdict);

  if (changed.length) {
    console.log('ZLE   werdykt zalezy od wysokosci okna, czyli od paska adresu:');
    for (const [id, verdict] of changed) {
      console.log(`      ${id}: ${before.get(id)} -> ${verdict}`);
    }
    console.log('');
    console.log('      pinned to position:sticky, flow to position:relative — przelaczenie');
    console.log('      przestawia sekcje w ukladzie i szarpie strona pod palcem.');
    process.exit(1);
  }

  console.log(`ok    ${real.length} sekcji, werdykty identyczne mimo innerHeight wiekszego o ${URL_BAR} px`);
  console.log('      pomiar idzie wzgledem 100svh, ktore jest stale — pasek adresu nic nie zmienia');
} finally {
  if (existsSync(probePath)) unlinkSync(probePath);
}
