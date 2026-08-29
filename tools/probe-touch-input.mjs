/**
 * Pola formularzy na telefonie: czy dotknięcie ich powiększa stronę i przesuwa widok.
 *
 *     node tools/probe-touch-input.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   iOS Safari powiększa całą stronę, gdy ognisko klawiatury trafia w pole o wyliczonym
 *   `font-size` mniejszym niż 16 px. Nie jest to błąd przeglądarki ani coś, co da się wyłączyć
 *   bez szkody: `maximum-scale=1` w meta viewport owszem to zatrzymuje, ale odbiera przy tym
 *   szczypanie do powiększania każdemu, kto go potrzebuje.
 *
 *   Powiększenie zmienia widoczny obszar, więc strona natychmiast po nim wygląda na
 *   przeskoczoną w losowe miejsce. Zgłoszone jako „chcę napisać na czacie, a to przeskakuje do
 *   sekcji z komentarzami i powiększa się strona" — i to są dwa objawy jednej przyczyny, nie
 *   dwa błędy.
 *
 * CO MIERZY
 *   1. każde pole na stronie, którego wyliczony font-size jest mniejszy niż 16 px;
 *   2. czy dotknięcie pola czatu przesuwa przewinięcie strony.
 *
 * Sprawdzane na wyliczonym stylu, nie w arkuszu: rozmiar może pochodzić z `font: inherit`,
 * ze zmiennej albo z clamp(), a liczy się tylko to, co widzi przeglądarka.
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
  if (!found) throw new Error('Nie znalazlem Chrome ani Edge.');
  return found;
}

const probe = [
  '<script>',
  '(async () => {',
  '  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
  '  const out = { errors: [], small: [] };',
  '  window.addEventListener("error", (e) => out.errors.push(String(e.message)));',
  '  await sleep(2600);',
  '',
  '  const name = (el) => {',
  '    const tag = el.tagName.toLowerCase();',
  '    const id = el.id ? "#" + el.id : (el.name ? "[name=" + el.name + "]" : "");',
  '    const owner = el.closest("section[id], .chat-panel, dialog, .modal");',
  '    const where = owner ? (owner.id || owner.className.split(" ")[0]) : "?";',
  '    return tag + id + " @ " + where;',
  '  };',
  '',
  '  /* Wszystkie pola, takze te w ukrytych sekcjach i oknach: ukryta sekcja otworzy sie',
  '     kiedys, a wtedy bedzie za pozno na pomiar. Ukryte elementy nie maja wyliczonego',
  '     rozmiaru w pikselach dopoki nie sa renderowane, wiec te bez pudelka sa liczone osobno. */',
  '  const fields = [...document.querySelectorAll("input, textarea, select")]',
  '    .filter((el) => !["hidden", "checkbox", "radio", "range", "file", "submit", "button"].includes(el.type));',
  '  out.total = fields.length;',
  '  out.unrendered = 0;',
  '  for (const el of fields) {',
  '    const size = Number.parseFloat(getComputedStyle(el).fontSize);',
  '    if (!el.getClientRects().length && !el.offsetParent) out.unrendered += 1;',
  '    if (Number.isFinite(size) && size < 16) out.small.push({ where: name(el), size: Math.round(size * 10) / 10 });',
  '  }',
  '',
  '  /* Czat: czy dotkniecie pola przesuwa strone. Panel jest position:fixed, wiec poprawnie',
  '     nie powinien ruszyc przewinieciem ani o piksel. */',
  '  document.querySelector("[data-chat-toggle], .contact-tab")?.click();',
  '  await sleep(700);',
  '  const field = document.querySelector(".chat__field, [data-chat-input]");',
  '  out.chat = { found: Boolean(field), panelOpen: Boolean(document.querySelector(".chat-panel.is-open, .chat-panel[open]")) };',
  '  if (field) {',
  '    out.chat.fontSize = Math.round(Number.parseFloat(getComputedStyle(field).fontSize) * 10) / 10;',
  '    window.scrollTo(0, 1400);',
  '    await sleep(300);',
  '    const before = Math.round(window.scrollY);',
  '    field.focus();',
  '    await sleep(600);',
  '    out.chat.scrollBefore = before;',
  '    out.chat.scrollAfter = Math.round(window.scrollY);',
  '    out.chat.drift = out.chat.scrollAfter - before;',
  '  }',
  '',
  '  const marker = document.createElement("pre");',
  '  marker.id = "probe-result";',
  '  marker.textContent = JSON.stringify(out, null, 1);',
  '  document.body.appendChild(marker);',
  '})();',
  '</script>'
].join('\n');

const file = 'dist/__touchprobe.html';
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedzial ${response.status}`);
writeFileSync(file, (await response.text()).replace('</body>', `${probe}</body>`), 'utf8');

const profile = mkdtempSync(join(tmpdir(), 'car-touch-'));
let fails = 0;
const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new', '--disable-gpu',
    // iPhone 14 w punktach CSS. Ponizej 761 px, wiec obowiazuja reguly telefonu.
    '--window-size=390,844',
    '--virtual-time-budget=40000', `--user-data-dir=${profile}`, '--dump-dom',
    `${base}/__touchprobe.html?skipIntro=1&lang=pl`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowala. Pierwsze 500 znakow:');
    console.log(dom.slice(0, 500));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  console.log(`bledy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}`);
  console.log(`pol na stronie: ${r.total} (nierenderowanych: ${r.unrendered})\n`);

  if (r.small.length) {
    console.log('Pola ponizej 16 px — kazde z nich powieksza strone na iOS:');
    for (const row of r.small) console.log(`   ${String(row.size).padStart(5)} px   ${row.where}`);
    console.log('');
  }
  check(r.small.length === 0, `zadne pole nie powieksza strony przy dotknieciu (znaleziono ${r.small.length})`);

  console.log('');
  if (r.chat?.found) {
    check(r.chat.fontSize >= 16, `pole czatu ma ${r.chat.fontSize} px`);
    check(r.chat.drift === 0,
      `dotkniecie pola czatu nie przesuwa strony (${r.chat.scrollBefore} -> ${r.chat.scrollAfter}, dryf ${r.chat.drift})`);
  } else {
    check(false, 'nie znalazlem pola czatu — sonda nie zmierzyla najwazniejszego przypadku');
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(file, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
