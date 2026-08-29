/**
 * Głosowanie w prawdziwej przeglądarce: trzy fazy, kafelki, okno oceny, podium.
 *
 *     node tools/probe-voting.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   check-voting.mjs sprawdza maszynę stanu bez przeglądarki i to jest właściwe miejsce na
 *   zegar. Ale nie odpowie na pytanie, czy sekcja jest ukryta, kiedy ma być ukryta, czy podium
 *   naprawdę się rysuje, i czy `hidden` na przycisku wygrywa z regułami CSS — a to są trzy
 *   sposoby, w jakie ta sekcja może zawieść, wyglądając w kodzie poprawnie.
 *
 *   Podglądowy serwer nie ma Workera, więc odpowiedź na /voting to 404 bez JSON-a, czyli
 *   dokładnie ten przypadek, w którym włącza się tryb demo. To nie jest obejście testu: to
 *   jest jedyny stan, w jakim ta strona istnieje przed dniem zawodów, i musi w nim działać.
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

/* Sonda jako tablica linii, nie szablon: w komentarzach tego pliku pojawiają się odwrotne
   apostrofy, a jeden taki w środku szablonu zamyka go w połowie i psuje plik. */
const probe = [
  '<script>',
  '(async () => {',
  '  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
  '  const out = { errors: [] };',
  '  window.addEventListener("error", (e) => out.errors.push(String(e.message)));',
  '  await sleep(2600);',
  '  const kill = document.createElement("style");',
  '  kill.textContent = "*,*::before,*::after{transition:none !important;animation:none !important}";',
  '  document.head.appendChild(kill);',
  '',
  '  const shown = (el) => Boolean(el) && getComputedStyle(el).display !== "none" && el.offsetParent !== null;',
  '  const section = document.querySelector("[data-voting]");',
  '  const podium = document.querySelector("[data-podium]");',
  '  const dialog = document.querySelector("[data-vote-dialog]");',
  '  const phaseButton = (phase) => [...document.querySelectorAll("[data-demo-phase]")]',
  '    .find((b) => b.dataset.demoPhase === phase);',
  '',
  '  const snapshot = () => ({',
  '    sectionShown: Boolean(section) && !section.hidden,',
  '    podiumShown: Boolean(podium) && !podium.hidden,',
  '    ctaShown: [...document.querySelectorAll("[data-vote-cta]")].map(shown),',
  '    clock: document.querySelector("[data-voting-clock]")?.textContent.trim() || "",',
  '    cards: document.querySelectorAll(".cart-card").length,',
  '    filters: document.querySelectorAll("[data-voting-category]").length,',
  '    filterLabels: [...document.querySelectorAll("[data-voting-category]")].map((b) => b.dataset.votingCategory),',
  '    openable: [...document.querySelectorAll(".cart-card__open")].filter((b) => !b.disabled).length,',
  '    stats: document.querySelectorAll(".cart-card__stats").length,',
  '    ranks: document.querySelectorAll(".cart-card__rank").length,',
  '    podiumCards: document.querySelectorAll(".podium-card").length,',
  '    signupLocked: shown(document.querySelector("[data-signup-locked]")),',
  '    submitDisabled: Boolean(document.querySelector("[data-registration-form] button[type=submit]")?.disabled)',
  '    ,signupLinks: [...document.querySelectorAll("a[href=\\"#signup\\"], a[data-feature-link=registration]")]',
  '      .filter((a) => a.dataset.voteCta === undefined)',
  '      .map((a) => a.getAttribute("aria-disabled") === "true")',
  '    ,demoBarFixed: (() => {',
  '      const bar = document.querySelector("[data-voting-demo]");',
  '      return bar ? getComputedStyle(bar).position : "";',
  '    })()',
  '    ,skipShown: shown(document.querySelector("[data-demo-skip]"))',
  '  });',
  '',
  '  out.demoBarPresent = Boolean(document.querySelector("[data-voting-demo]"));',
  '  out.scheduled = snapshot();',
  '',
  '  /* „Zakoncz odliczanie": przejscie ma sie odbyc ta sama droga co w dniu zawodow — przez',
  '     watchStart, na oczach patrzacego — a nie skokiem stanu. */',
  '  document.querySelector("[data-demo-skip]")?.click();',
  '  await sleep(3600);',
  '  out.afterSkip = snapshot();',
  '',
  '  phaseButton("voting")?.click();',
  '  await sleep(500);',
  '  out.voting = snapshot();',
  '',
  '  /* Klik w „Zapisz sie" w trakcie wyscigu nie moze zaprowadzic do formularza. */',
  '  const signupLink = [...document.querySelectorAll("a[href=\\"#signup\\"]")]',
  '    .find((a) => a.dataset.voteCta === undefined);',
  '  signupLink?.click();',
  '  await sleep(400);',
  '  out.signupClick = {',
  '    toast: document.querySelector("[data-toast-text]")?.textContent.trim() || "",',
  '    tone: document.querySelector("[data-toast]")?.dataset.toastTone || "",',
  '    visible: document.querySelector("[data-toast]")?.classList.contains("is-visible") || false',
  '  };',
  '',
  '  /* Okno oceny: otwarcie, suwak, wysyłka. Backendu nie ma, wiec postJSON zwraca tryb demo',
  '     i sciezka sukcesu przechodzi do konca — czyli sprawdzamy dokladnie to, co widzi',
  '     glosujacy po wyslaniu. */',
  '  document.querySelector(".cart-card__open")?.click();',
  '  await sleep(400);',
  '  const slider = dialog?.querySelector("[data-vote-score]");',
  '  out.dialog = {',
  '    open: Boolean(dialog?.open),',
  '    project: dialog?.querySelector("[data-vote-project]")?.textContent.trim() || "",',
  '    rider: dialog?.querySelector("[data-vote-rider]")?.textContent.trim() || "",',
  '    number: dialog?.querySelector("[data-vote-number]")?.textContent.trim() || "",',
  '    min: slider?.min || "", max: slider?.max || "", start: slider?.value || "",',
  '    shownValue: dialog?.querySelector("[data-vote-score-value]")?.textContent.trim() || "",',
  '    bodyLocked: document.body.classList.contains("is-locked")',
  '  };',
  '',
  '  if (slider) { slider.value = "9"; slider.dispatchEvent(new Event("input", { bubbles: true })); }',
  '  out.dialog.afterDrag = dialog?.querySelector("[data-vote-score-value]")?.textContent.trim() || "";',
  '',
  '  /* Puste pola musza zatrzymac wysylke — to ten sam warunek co w formularzu zapisow. */',
  '  dialog?.querySelector("[data-vote-send]")?.click();',
  '  await sleep(300);',
  '  out.dialog.blockedWhenEmpty = Boolean(dialog?.open);',
  '',
  '  const form = document.querySelector("[data-vote-form]");',
  '  const fill = (name, value) => {',
  '    const field = form?.elements.namedItem(name);',
  '    if (field) { field.value = value; field.dispatchEvent(new Event("input", { bubbles: true })); }',
  '  };',
  '  fill("name", "Marco");',
  '  fill("email", "marco@example.com");',
  '  dialog?.querySelector("[data-vote-send]")?.click();',
  '  await sleep(900);',
  '  out.afterVote = {',
  '    dialogClosed: !dialog?.open,',
  '    bodyUnlocked: !document.body.classList.contains("is-locked"),',
  '    bodyClasses: document.body.className,',
  '    votedCards: document.querySelectorAll(".cart-card.is-voted").length,',
  '    yourScore: document.querySelector(".cart-card__yours")?.textContent.trim() || "",',
  '    toast: document.querySelector("[data-toast-text]")?.textContent.trim() || "",',
  '    toastTone: document.querySelector("[data-toast]")?.dataset.toastTone || "",',
  '    toastRole: document.querySelector("[data-toast]")?.getAttribute("role") || "",',
  '    toastCentred: (() => {',
  '      const el = document.querySelector("[data-toast]");',
  '      if (!el) return false;',
  '      const box = el.getBoundingClientRect();',
  '      // clientWidth, nie innerWidth: element ustawiony na fixed liczy sie wzgledem obszaru',
  '      // BEZ paska przewijania, a innerWidth go wlicza — roznica to kilka pikseli i falszywy',
  '      // blad. Tolerancja dwoch pikseli na zaokraglenia.',
  '      return Math.abs((box.left + box.right) / 2 - document.documentElement.clientWidth / 2) < 2;',
  '    })()',
  '  };',
  '',
  '  phaseButton("closed")?.click();',
  '  await sleep(600);',
  '  out.closed = snapshot();',
  '  out.closed.podiumPlaces = [...document.querySelectorAll(".podium-card")]',
  '    .map((c) => c.dataset.podiumPlace + ":" + (c.querySelector("strong")?.textContent.trim() || ""));',
  '  out.closed.podiumArtDrawn = Boolean(document.querySelector("[data-podium-art]")?.classList.contains("is-drawn"));',
  '  out.closed.svgBlocks = document.querySelectorAll(".podium__block").length;',
  '',
  '  const marker = document.createElement("pre");',
  '  marker.id = "probe-result";',
  '  marker.textContent = JSON.stringify(out, null, 1);',
  '  document.body.appendChild(marker);',
  '})();',
  '</script>'
].join('\n');

const file = 'dist/__votingprobe.html';
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedzial ${response.status}`);
writeFileSync(file, (await response.text()).replace('</body>', `${probe}</body>`), 'utf8');

const profile = mkdtempSync(join(tmpdir(), 'car-voting-'));
let fails = 0;
const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new', '--disable-gpu', '--window-size=1280,1000',
    '--virtual-time-budget=40000', `--user-data-dir=${profile}`, '--dump-dom',
    `${base}/__votingprobe.html?demo=1&skipIntro=1&lang=pl`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowala. Pierwsze 500 znakow:');
    console.log(dom.slice(0, 500));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  console.log(`bledy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);
  check(r.errors.length === 0, 'zero bledow JavaScriptu');
  check(r.demoBarPresent, 'tryb demo dolozyl przelacznik faz');

  console.log('\n--- faza 1: przed startem');
  const a = r.scheduled;
  check(a.podiumShown === false, 'podium ukryte');
  check(a.ctaShown.every((v) => v === false), `przycisk „zaglosuj" ukryty w ${a.ctaShown.length} miejscach`);
  check(a.openable === 0, 'kafelkow nie da sie otworzyc');
  check(a.signupLocked === false && a.submitDisabled === false, 'zapisy otwarte');
  check(a.clock.includes('Start za'), `licznik odlicza do startu: „${a.clock}"`);
  check(a.signupLinks.length > 0 && a.signupLinks.every((v) => v === false),
    `odsylacze „Zapisz sie" dzialaja (${a.signupLinks.length})`);
  check(a.demoBarFixed === 'fixed', `pasek demo przypiety do okna: ${a.demoBarFixed}`);
  check(a.skipShown, '„Zakoncz odliczanie" widoczne przed startem');

  console.log('\n--- „Zakoncz odliczanie"');
  const s = r.afterSkip;
  check(s.ctaShown.every((v) => v === true), 'po przejsciu przez zero pojawia sie przycisk „zaglosuj"');
  check(s.signupLocked && s.submitDisabled, 'zapisy zablokowane bez klikania w faze');
  check(s.skipShown === false, '„Zakoncz odliczanie" znika, gdy nie ma czego konczyc');

  console.log('\n--- faza 2: glosowanie otwarte');
  const b = r.voting;
  check(b.sectionShown, 'sekcja glosowania widoczna');
  check(b.ctaShown.every((v) => v === true), `przycisk „zaglosuj" widoczny w ${b.ctaShown.length} miejscach`);
  check(b.cards === 3, `kafelki jednej kategorii: ${b.cards}`);
  check(b.filters === 2 && b.filterLabels.join(',') === 'classic,art', `filtr kategorii: ${b.filterLabels.join(', ')}`);
  check(b.openable === b.cards, 'wszystkie kafelki klikalne');
  check(b.stats === 0, 'srednie NIE sa pokazywane w trakcie glosowania');
  check(b.signupLocked && b.submitDisabled, 'zapisy zablokowane w trakcie wyscigu');
  check(b.signupLinks.every((v) => v === true),
    `wszystkie odsylacze „Zapisz sie" oznaczone jako nieczynne (${b.signupLinks.length})`);
  check(b.clock.includes('Pozosta'), `licznik pokazuje pozostaly czas: „${b.clock}"`);
  const sc = r.signupClick;
  check(sc.visible && sc.toast.length > 0,
    `klik w „Zapisz sie" tlumaczy, co sie dzieje: „${sc.toast.slice(0, 46)}…"`);

  console.log('\n--- okno oceny');
  const d = r.dialog;
  check(d.open, 'okno otwarte po kliknieciu kafelka');
  check(d.bodyLocked, 'tlo zablokowane, gdy okno jest otwarte');
  check(d.project.length > 0 && d.rider.length > 0, `okno zna pojazd i zawodnika: „${d.project}" / „${d.rider}"`);
  check(d.number.length === 3, `numer startowy w oknie: ${d.number}`);
  check(d.min === '3' && d.max === '10', `skala od ${d.min} do ${d.max}`);
  check(d.start !== '10' && d.start !== '3', `suwak startuje w srodku skali: ${d.start}`);
  check(d.shownValue === d.start, 'wyswietlana wartosc zgadza sie z suwakiem');
  check(d.afterDrag === '9', `przesuniecie suwaka zmienia liczbe: ${d.afterDrag}`);
  check(d.blockedWhenEmpty, 'puste imie i adres zatrzymuja wysylke');

  console.log('\n--- po oddaniu glosu');
  const v = r.afterVote;
  check(v.dialogClosed, 'okno zamkniete po wyslaniu');
  /* Ten warunek raz już upadł i dlatego jest tu osobno, a nie zrośnięty z poprzednim.
     `dialog.close()` wykonało się, okno się zamknęło, a zdarzenie `close` nie wystąpiło ani
     razu — a było jedynym miejscem, w którym zdejmowana była blokada przewijania. Na ekranie
     wygląda to jak zawieszona strona: nic nie widać i nie da się przewinąć. Sprzątanie
     przeniesione do samego `close()`, w voting.js i w dialogu zgód w app.js. */
  check(v.bodyUnlocked, `tlo odblokowane, strona da sie przewijac (klasy body: „${v.bodyClasses}")`);
  check(v.votedCards === 1, `dokladnie jeden kafelek oznaczony jako oceniony: ${v.votedCards}`);
  check(v.yourScore.includes('9'), `kafelek pokazuje wlasna ocene: „${v.yourScore}"`);
  check(v.toast.length > 0, `podziekowanie na pasku: „${v.toast}"`);
  check(v.toastTone === 'success', `pasek w odmianie potwierdzenia: ${v.toastTone}`);
  check(v.toastRole === 'status', `potwierdzenie nie przerywa czytnika ekranu (role=${v.toastRole})`);
  check(v.toastCentred, 'pasek komunikatow wysrodkowany w oknie');

  console.log('\n--- faza 3: podium');
  const c = r.closed;
  check(c.podiumShown, 'podium widoczne');
  check(c.podiumCards === 3, `trzy karty zwyciezcow: ${c.podiumCards}`);
  check(c.svgBlocks === 3, `trzy schodki w rysunku SVG: ${c.svgBlocks}`);
  check(c.podiumPlaces.join(' | ').startsWith('1:'), `kolejnosc w tresci to 1,2,3: ${c.podiumPlaces.join(' | ')}`);
  check(c.stats === c.cards && c.cards > 0, `srednie pokazane przy kazdym kafelku (${c.stats}/${c.cards})`);
  check(c.ranks === c.cards, 'kazdy kafelek ma miejsce w rankingu');
  check(c.openable === 0, 'po zamknieciu nie da sie otworzyc okna oceny');
  check(c.ctaShown.every((v) => v === false), 'przycisk „zaglosuj" znowu ukryty');
  check(c.signupLocked === false && c.submitDisabled === false, 'zapisy odblokowane po zamknieciu');
  check(c.signupLinks.every((v) => v === false), 'odsylacze „Zapisz sie" znowu dzialaja');
  check(c.clock.includes('zamkni'), `licznik mowi o zamknieciu: „${c.clock}"`);

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(file, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
