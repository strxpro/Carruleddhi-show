/**
 * Sprawdza w prawdziwej przeglądarce poprawki z tej tury.
 *
 *     npm run preview        (w drugim oknie, na :4177)
 *     node tools/probe-polish.mjs
 *
 * PO CO
 *   Każda rzecz mierzona niżej była już raz „zrobiona" w kodzie i nie działała na stronie.
 *   Przycisk „Zostaw wiadomość" miał ustawiony tekst i ustawiony kolor — biały na kremowym,
 *   czyli z kodu wyglądał na gotowy, a na ekranie był pustą ramką. Tego nie widać z
 *   czytania źródła i nie widać z `npm run build`; widać po odczytaniu policzonego stylu.
 *
 *   Więc: prawdziwy Chrome, prawdziwy layout, odczyt tego, co przeglądarka naprawdę
 *   policzyła. Kontrast liczony z rzeczywistych kolorów, wysokość sekcji przed i po
 *   rozwinięciu formularza, nakładanie kart z geometrii, a nie z założeń.
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
  if (!found) throw new Error('Nie znalazłem Chrome ani Edge.');
  return found;
}

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2200);

  /* Kontrast wg WCAG, z policzonych kolorów. Tło brane z pierwszego przodka, który
     naprawdę coś maluje — element z tłem "transparent" nie mówi nic o tym, co pod nim. */
  const rgb = (value) => (String(value).match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const paintedBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const parts = rgb(bg);
      if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0.5)) return parts;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const contrast = (el) => {
    const fg = rgb(getComputedStyle(el).color);
    const bg = paintedBg(el);
    if (fg.length < 3) return 0;
    const a = lum(fg); const b = lum(bg);
    return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
  };

  // ---------------------------------------------------------------- 1. przycisk tablicy
  const wallOpen = document.querySelector('[data-wall-open]');
  const wallSection = document.getElementById('wall');
  if (wallOpen && wallSection) {
    wallSection.scrollIntoView();
    await sleep(400);
    const label = wallOpen.querySelector('[data-i18n="wall.openForm"]');
    const btnRect = wallOpen.getBoundingClientRect();
    const parentRect = wallOpen.parentElement.getBoundingClientRect();
    out.wallButton = {
      label: (label?.textContent || '').trim(),
      contrast: contrast(label || wallOpen),
      // Wyśrodkowanie: odstęp z lewej i z prawej w obrębie rodzica ma być równy.
      leftGap: Math.round(btnRect.left - parentRect.left),
      rightGap: Math.round(parentRect.right - btnRect.right),
      display: getComputedStyle(wallOpen).display
    };

    // ------------------------------------------------- 2. sekcja rośnie po rozwinięciu
    const nextSection = wallSection.nextElementSibling;
    const before = {
      panel: wallSection.dataset.panel || '',
      height: wallSection.offsetHeight,
      foldHeight: document.querySelector('[data-wall-fold]')?.offsetHeight || 0
    };
    /* Tranzycje wyłączone na czas pomiaru.
       ---------------------------------------------------------------------------
       Nie po to, żeby było szybciej. W headless Chrome z --virtual-time-budget zegar
       animacji nie idzie: rAF jest głodzony i tranzycje CSS stoją na wartości
       początkowej. Wysokość folda zostawała więc na 0 px przy założonej klasie
       is-open — co wygląda dokładnie jak zepsuty CSS, a jest zamrożonym zegarem.
       (To samo zamrożenie trzymało pasek preloadera na 0%; tam wyszło z tego prawdziwe
       znalezisko, bo na wolnym telefonie dzieje się to samo.)

       Bez tranzycji wysokość wskakuje od razu, a ResizeObserver i tak działa, bo
       chodzi za układem, nie za klatkami. Mierzymy więc stan końcowy, o który chodzi:
       czy sekcja urosła i czy nic nie jest obcięte. */
    const killMotion = document.createElement('style');
    killMotion.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(killMotion);

    wallOpen.click();
    // Fold przeskakuje od razu, potem ResizeObserver, potem pomiar panelu. Z zapasem.
    await sleep(1400);
    const fold = document.querySelector('[data-wall-fold]');
    /* Diagnostyka, nie ozdoba. Kiedy „formularz się nie rozwinął" trzeba od razu wiedzieć,
       czy klasa nie doszła (JS), czy doszła i nic nie zmieniła (CSS), czy sekcja jest
       ukryta (feature flag). Bez tego trzy różne przyczyny wyglądają identycznie. */
    out.wallDiag = {
      foldClasses: fold.className,
      foldMaxHeight: getComputedStyle(fold).maxHeight,
      buttonExpanded: wallOpen.getAttribute('aria-expanded'),
      sectionHidden: wallSection.hidden,
      sectionState: wallSection.dataset.wallState || '',
      innerHeight: fold.querySelector('.wall-fold__inner')?.offsetHeight ?? null,
      formDisplay: getComputedStyle(document.querySelector('[data-wall-form]')).display,
      /* Powtórzenie tego, co robi measure() w app.js, na tym samym elemencie.
         Verdykt "pinned" przy sekcji wyższej niż ekran znaczy jedno z dwóch: albo pomiar
         nie odpalił, albo odpalił i policzył mniej, niż sekcja naprawdę ma. To są dwie
         różne naprawy, więc trzeba je rozróżnić, a nie zgadywać. */
      measureModeHeight: (() => {
        const previous = wallSection.dataset.panel;
        wallSection.dataset.panel = 'measure';
        const h = wallSection.scrollHeight;
        wallSection.dataset.panel = previous;
        return h;
      })(),
      viewport: window.innerHeight,
      overflow: getComputedStyle(wallSection).overflow,
      position: getComputedStyle(wallSection).position
    };
    const foldRect = fold.getBoundingClientRect();
    const nextRect = nextSection ? nextSection.getBoundingClientRect() : null;
    out.wallFold = {
      before,
      after: {
        panel: wallSection.dataset.panel || '',
        height: wallSection.offsetHeight,
        foldHeight: fold.offsetHeight
      },
      // Ujemne = następna sekcja zaczyna się nad dołem formularza, czyli go zasłania.
      roomBelowFold: nextRect ? Math.round(nextRect.top - foldRect.bottom) : null,
      // Czy cokolwiek z formularza zostało obcięte przez overflow sekcji.
      clipped: wallSection.scrollHeight > wallSection.offsetHeight + 4
    };
  } else {
    out.errors.push('brak sekcji wall albo przycisku');
  }

  // ------------------------------------------------------------------- 3. awatary
  const stack = document.querySelector('.avatar-stack');
  if (stack) {
    const circles = [...stack.querySelectorAll('.avatar')];
    out.avatars = {
      total: circles.length,
      visible: circles.filter((c) => !c.hidden).length,
      values: circles.map((c) => c.textContent.trim()),
      last: circles[circles.length - 1].textContent.trim()
    };
  }

  // ----------------------------------------------- 4. hover nie rusza, klik wciska
  const btn = document.querySelector('.btn');
  if (btn) {
    const style = getComputedStyle(btn);
    out.button = {
      // Reguła :hover nie da się wywołać z JS, więc czytamy arkusze: szukamy, czy
      // gdziekolwiek .btn:hover nadal ma translate.
      hoverHasTransform: [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) =>
            rule.selectorText === '.btn:hover' && /translate/.test(rule.style.transform || ''));
        } catch (_) { return false; }
      }),
      activeRuleExists: [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) =>
            rule.selectorText === '.btn:active' && /translate/.test(rule.style.transform || ''));
        } catch (_) { return false; }
      }),
      transition: style.transitionProperty
    };
  }

  // ------------------------------------------------------ 5. fajka na przycisku obecności
  const press = document.querySelector('.attendance__press');
  if (press) {
    press.classList.add('is-done');
    await sleep(120);
    out.tick = { after: getComputedStyle(press, '::after').content };
    press.classList.remove('is-done');
  }

  // -------------------------------------------------------- 6. napis na zdjęciu trasy
  out.routeAside = document.querySelectorAll('.route__aside').length;
  const obstacles = document.querySelector('.route__fact--obstacles span');
  out.obstaclesLabel = (obstacles?.textContent || '').trim();

  // ---------------------------------------------------------------- 7. pasek preloadera
  const bar = document.querySelector('[data-preloader-bar]');
  out.preloader = {
    // Do tego momentu strona jest dawno wczytana, więc pasek ma stać na 100%.
    width: bar ? bar.style.width : '(brak)',
    barTransition: bar ? getComputedStyle(bar).transitionProperty : '(brak)',
    hidden: document.querySelector('[data-preloader]')?.hidden ?? null
  };

  // ------------------------------------------------------------------- 8. sponsorzy
  const band = document.querySelector('[data-sponsor-band]');
  out.sponsors = {
    hidden: band ? band.hidden : null,
    logos: document.querySelectorAll('.sponsor-logo').length
  };

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-polish-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__polishprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=45000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__polishprobe.html`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  const ok = (pass, line) => console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`);
  let fails = 0;
  const check = (pass, line) => { if (!pass) fails += 1; ok(pass, line); };

  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  if (r.wallButton) {
    const b = r.wallButton;
    check(b.label.length > 0, `etykieta przycisku tablicy: "${b.label}"`);
    check(b.contrast >= 4.5, `kontrast etykiety: ${b.contrast}:1 (WCAG AA wymaga 4.5)`);
    check(Math.abs(b.leftGap - b.rightGap) <= 2,
      `wyśrodkowany: ${b.leftGap} px z lewej, ${b.rightGap} px z prawej`);
  }

  if (r.wallFold) {
    const f = r.wallFold;
    console.log('');
    check(f.after.foldHeight > 200,
      `formularz rozwinięty: ${f.before.foldHeight} px -> ${f.after.foldHeight} px`);
    check(f.after.height > f.before.height,
      `sekcja urosła: ${f.before.height} px -> ${f.after.height} px (panel ${f.before.panel} -> ${f.after.panel})`);
    check(!f.clipped, `nic nie obcięte przez overflow sekcji`);
    if (r.wallDiag) console.log(`      diagnostyka: ${JSON.stringify(r.wallDiag)}`);
    if (f.roomBelowFold !== null) {
      check(f.roomBelowFold >= 0,
        `następna sekcja nie zasłania formularza: ${f.roomBelowFold} px pod nim`);
    }
  }

  if (r.avatars) {
    console.log('');
    check(r.avatars.total === 5, `pięć kółek: ${r.avatars.total} (cztery inicjały + reszta)`);
    check(/^\+\d/.test(r.avatars.last), `ostatnie kółko to licznik: "${r.avatars.last}"`);
    console.log(`      wartości: ${r.avatars.values.join(' ')}`);
  }

  if (r.button) {
    console.log('');
    check(!r.button.hoverHasTransform, 'hover .btn nie przesuwa przycisku');
    check(r.button.activeRuleExists, 'klik .btn ma własny transform (wciśnięcie)');
  }

  if (r.tick) {
    console.log('');
    check(!/✓/.test(r.tick.after), `brak fajki na wciśniętym przycisku (::after = ${r.tick.after})`);
  }

  console.log('');
  check(r.routeAside === 0, `napisów na zdjęciu trasy: ${r.routeAside}`);
  check(!/roku|year|año|Jahr|anno|année/i.test(r.obstaclesLabel),
    `tekst o przeszkodach: "${r.obstaclesLabel}"`);

  console.log('');
  check(r.preloader.width === '100.0%' || r.preloader.hidden === true,
    `pasek preloadera doszedł do końca: ${r.preloader.width}, ukryty: ${r.preloader.hidden}`);
  check(!/width/.test(r.preloader.barTransition),
    `pasek bez tranzycji szerokości (${r.preloader.barTransition})`);

  console.log('');
  console.log(`sponsorzy: ${r.sponsors.logos} logo, pasek ukryty: ${r.sponsors.hidden}`);
  if (r.sponsors.logos === 0) {
    console.log('      (bez sponsorów w ustawieniach pasek jest ukryty — sprawdź z ?demo=1)');
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
