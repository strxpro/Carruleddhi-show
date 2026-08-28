/**
 * Telefon 390x844: header, modal, pastylki przypomnien, komentarze.
 *
 *     node tools/probe-mobile.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   Wszystkie te rzeczy sa poprawne na desktopie i zepsute na telefonie, a roznica siedzi
 *   w media queries, ktorych nie widac czytajac plik po kolei — regula 254px kilkadziesiat
 *   linii nizej wygrywala z ta, ktora mialo dzialac. Wiec: prawdziwa szerokosc okna,
 *   prawdziwy layout, odczyt tego, co przegladarka policzyla.
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
  const out = { errors: [], width: window.innerWidth, height: window.innerHeight };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2400);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const header = document.querySelector('[data-header]');
  const picker = document.querySelector('.language-picker');
  const seen = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      opacity: Number(s.opacity).toFixed(2),
      visibility: s.visibility,
      display: s.display
    };
  };

  // --- header zwiniety po przewinieciu
  window.scrollTo(0, 600);
  window.dispatchEvent(new Event('scroll'));
  await sleep(500);
  out.compact = {
    hasClass: header?.classList.contains('is-compact') ?? null,
    header: seen(header),
    flag: seen(picker)
  };

  // --- header po otwarciu menu
  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(450);
  out.menuOpen = {
    hasClass: header?.classList.contains('is-menu-open') ?? null,
    header: seen(header),
    flag: seen(picker),
    attend: seen(document.querySelector('.nav-attend'))
  };
  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(350);

  // --- modal: header widoczny, rozmiar bez skalowania
  const opener = document.querySelector('[data-open-reminder]');
  if (opener) {
    document.getElementById('attendance')?.scrollIntoView();
    await sleep(300);
    opener.click();
    await sleep(500);
    const dialog = document.querySelector('.modal__dialog');
    const dRect = dialog?.getBoundingClientRect();
    const matrix = dialog
      ? new DOMMatrixReadOnly(getComputedStyle(dialog).transform === 'none' ? '' : getComputedStyle(dialog).transform)
      : null;
    out.modal = {
      headerOpacity: header ? Number(getComputedStyle(header).opacity).toFixed(2) : null,
      headerVisible: header ? getComputedStyle(header).visibility : null,
      dialogWidth: dRect ? Math.round(dRect.width) : null,
      viewport: window.innerWidth,
      // Skala 1 znaczy, ze dialog otwiera sie w swoim koncowym rozmiarze.
      scale: matrix ? Number(matrix.a.toFixed(3)) : null,
      dialogTop: dRect ? Math.round(dRect.top) : null,
      headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
      animationName: dialog ? getComputedStyle(dialog).animationName : null
    };

    // Pastylki przypomnien w modalu: rowna szerokosc i wysokosc.
    const chips = [...document.querySelectorAll('[data-reminder-times] span')]
      .filter((c) => !c.hidden)
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), t: c.textContent.trim() };
      });
    out.chips = chips;

    document.querySelector('[data-modal-close], .modal__close')?.click();
    await sleep(350);
  }

  // --- formularz: kropka progresu nie na napisie
  document.getElementById('signup')?.scrollIntoView();
  await sleep(400);
  const runner = document.querySelector('.form-progress__runner');
  const heading = document.querySelector('[data-form-step="1"] h3');
  if (runner && heading) {
    const a = runner.getBoundingClientRect();
    const b = heading.getBoundingClientRect();
    out.progress = {
      runnerBottom: Math.round(a.bottom),
      headingTop: Math.round(b.top),
      gap: Math.round(b.top - a.bottom)
    };
  }

  /* --- komentarze
     Czekanie jest dlugie i to nie przypadek: wczytanie listy wisi na IntersectionObserver
     z zapasowym timerem 6 s, a w headless obserwator nie odpala. Krotsze czekanie mierzyloby
     pusta liste i wygladalo na brak awatarow. */
  document.getElementById('wall')?.scrollIntoView();
  window.dispatchEvent(new Event('scroll'));
  await sleep(7000);
  const notes = [...document.querySelectorAll('.wall-note')];
  out.wall = {
    notes: notes.length,
    avatars: document.querySelectorAll('.wall-note__avatar').length,
    tones: [...new Set([...document.querySelectorAll('.wall-note__avatar')].map((a) => a.dataset.tone))].sort(),
    askButtonPresent: Boolean(document.querySelector('.wall-ask')),
    firstNoteWidth: notes[0] ? Math.round(notes[0].getBoundingClientRect().width) : null,
    firstNoteHeight: notes[0] ? Math.round(notes[0].getBoundingClientRect().height) : null,
    moreVisible: (() => {
      const m = document.querySelector('[data-wall-more]');
      return m ? !m.hidden : null;
    })()
  };

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-mobile-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__mobileprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=390,844',
    '--virtual-time-budget=45000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__mobileprobe.html?skipIntro=1&demo=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  let fails = 0;
  const check = (pass, line) => {
    if (!pass) fails += 1;
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`);
  };

  console.log(`okno ${r.width}x${r.height}   błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  if (r.compact) {
    check(r.compact.hasClass === true, 'header zwija się po przewinięciu');
    const f = r.compact.flag;
    check(f && f.w > 20 && f.visibility === 'visible' && Number(f.opacity) > 0.9,
      `flaga widoczna w zwiniętym headerze: ${f?.w}x${f?.h} px, krycie ${f?.opacity}, ${f?.visibility}`);
    console.log(`      pasek: ${r.compact.header?.w} px szerokości`);
  }

  if (r.menuOpen) {
    console.log('');
    check(r.menuOpen.hasClass === true, 'menu się otwiera');
    const f = r.menuOpen.flag;
    const a = r.menuOpen.attend;
    check(f && Number(f.opacity) > 0.9, `flaga widoczna przy otwartym menu: krycie ${f?.opacity}`);
    check(a && Number(a.opacity) > 0.9, `przycisk „będę tam" wraca: krycie ${a?.opacity}, ${a?.w} px`);
  }

  if (r.modal) {
    console.log('');
    check(Number(r.modal.headerOpacity) > 0.4 && r.modal.headerVisible === 'visible',
      `header widoczny przy otwartym modalu: krycie ${r.modal.headerOpacity}`);
    check(r.modal.scale === 1,
      `modal otwiera się w docelowym rozmiarze (skala ${r.modal.scale}, animacja ${r.modal.animationName})`);
    /* 40px zapasu: 12px paddingu z kazdej strony modala plus pasek przewijania, ktory
       w headless zabiera kilkanascie pikseli z szerokosci okna. */
    check((r.modal.dialogWidth || 0) >= r.modal.viewport - 40,
      `modal dopasowany do ekranu: ${r.modal.dialogWidth} px na ${r.modal.viewport} px`);
    check((r.modal.dialogTop || 0) >= (r.modal.headerBottom || 0) - 4,
      `modal nie wchodzi pod header: góra ${r.modal.dialogTop} px, dół headera ${r.modal.headerBottom} px`);
  }

  if (r.chips?.length) {
    console.log('');
    const widths = new Set(r.chips.map((c) => c.w));
    const heights = new Set(r.chips.map((c) => c.h));
    check(widths.size === 1, `pastylki tej samej szerokości: ${[...widths].join(', ')} px`);
    check(heights.size === 1, `pastylki tej samej wysokości: ${[...heights].join(', ')} px`);
    console.log(`      ${r.chips.map((c) => `"${c.t}"`).join(' · ')}`);
  }

  if (r.progress) {
    console.log('');
    check(r.progress.gap >= 0,
      `kropka postępu nie nachodzi na nagłówek: ${r.progress.gap} px odstępu`);
  }

  if (r.wall) {
    console.log('');
    check(r.wall.askButtonPresent === false, 'przycisku „napisz do nas" nie ma w liście komentarzy');
    check(r.wall.avatars === r.wall.notes && r.wall.notes > 0,
      `awatar na każdym komentarzu: ${r.wall.avatars} z ${r.wall.notes}`);
    check(r.wall.tones.length >= 3, `awatary w różnych kolorach: odcienie ${r.wall.tones.join(', ')}`);
    console.log(`      kafelek ${r.wall.firstNoteWidth}x${r.wall.firstNoteHeight} px, „pokaż więcej": ${r.wall.moreVisible}`);
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
