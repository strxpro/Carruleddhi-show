/**
 * Ocenianie na zdjęciu, zmierzone w przeglądarce.
 *
 *     node tools/probe-vote-veil.mjs http://127.0.0.1:4173
 *
 * Okno 390×844 i tryb demo, tak samo jak w probe-voting.mjs: dwie kolumny i cele po 44 px mają
 * znaczenie na telefonie, a na monitorze przeszłyby zawsze.
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4173';

let fails = 0;
const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

const raw = execFileSync(process.execPath, [
  'tools/cdp.mjs', 'probe', 'tools/probe-vote-veil.js',
  '--w', '390', '--h', '844',
  '--url', '/votazione.html?demo=1&lang=pl', '--origin', base, '--wait', '3000'
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let p;
try {
  p = JSON.parse(raw);
} catch (_) {
  console.log(`Sonda nie oddala JSON-a:\n${raw.slice(0, 900)}`);
  process.exit(1);
}

console.log(`OCENIANIE NA ZDJECIU (390x844) — bledy JS: ${p.consoleErrors?.length ? p.consoleErrors.join(' | ') : 'brak'}\n`);
check((p.consoleErrors || []).length === 0, 'zero bledow JavaScriptu');

console.log('\n--- spoczynek: kafelek jest samym zdjeciem');
check(p.rest.cards >= 2, `kafelki sa (${p.rest.cards})`);
check(p.rest.hasVeil && p.rest.hasCta, 'nakladka i zaproszenie istnieja w drzewie');
check(p.rest.veilOpacity === 0, `nakladka niewidoczna w spoczynku (krycie ${p.rest.veilOpacity})`);
check(p.rest.veilEvents === 'none', `nakladka nie lapie wskaznika (${p.rest.veilEvents})`);
check(p.rest.pickHidden === true, 'suwak schowany');
check(p.rest.buttonsUnderPhoto === 0, `zero przyciskow POD zdjeciem (${p.rest.buttonsUnderPhoto})`);
check(p.rest.hasHit, 'przezroczysty cel dotkniecia na zdjeciu');

/* JEDNO DOTKNIECIE, NIE DWA.
   ---------------------------------------------------------------------------
   Stalo tu „suwak jeszcze schowany" i „cel dotykowy zaproszenia", czyli opis stanu
   POSREDNIEGO: pierwsze dotkniecie tylko odslanialo pigulke „Zaglosuj", a suwak wymagal
   drugiego. To byla usterka „klikam w zaglosuj i nic sie nie robi" — na myszy najechanie
   odslania pigulke darmo, a pod palcem nie ma czym oddzielic przygotowania od nacisniecia.
   Pigulka jest teraz mierzona w SPOCZYNKU (ma juz wtedy swoje pudelko, tylko nakladka jest
   niewidoczna), a dotkniecie ma od razu rozwinac suwak. Patrz probe-voting-mobile.mjs. */
console.log('\n--- jedno dotkniecie: suwak od razu');
check(p.armed.cardArmed, 'kafelek oznaczony jako odslony');
check(p.armed.veilOpacity === 1, `nakladka widoczna (krycie ${p.armed.veilOpacity})`);
check(p.armed.veilEvents === 'auto', 'nakladka lapie wskaznik');
check(p.armed.hitHidden === true, 'przezroczysta warstwa schodzi z drogi suwakowi');
check(Boolean(p.armed.ctaLabel), `zaproszenie ma napis: „${p.armed.ctaLabel}"`);
check(p.rest.ctaHeight >= 44, `cel dotykowy zaproszenia (w spoczynku): ${p.rest.ctaHeight} px`);
check(p.rest.ctaInsidePhoto, 'zaproszenie stoi NA zdjeciu, nie pod nim');
check(p.armed.pickHidden === false, 'JEDNO dotkniecie rozwija suwak, bez drugiego');

console.log('\n--- klik: przycisk przeistacza sie w suwak');
check(p.picking.cardPicking, 'kafelek w trybie wyboru oceny');
check(p.picking.ctaGone === true, 'zaproszenie ustepuje miejsca suwakowi');
check(p.picking.pickShown === true, 'suwak odsloniety');
check(p.picking.hasSlider, 'suwak istnieje');
check(p.picking.sliderMin === '3' && p.picking.sliderMax === '10',
  `zakres z serwera: ${p.picking.sliderMin}-${p.picking.sliderMax}`);
check(p.picking.sliderHeight >= 40, `cel dotykowy suwaka: ${p.picking.sliderHeight} px`);
check(p.picking.pickInsidePhoto, 'suwak wyrasta w miejscu przycisku, na zdjeciu');
check(Boolean(p.picking.sendLabel), `wysylka ma napis: „${p.picking.sendLabel}"`);
check(p.picking.sendHeight >= 44, `cel dotykowy wysylki: ${p.picking.sendHeight} px`);
/* Podpis nad suwakiem na BIALYM tle. Reguly suwaka byly pisane pod ciemny panel, wiec bez
   nadpisania byl to bialy tekst na bialym — niewidoczny dokladnie w chwili wybierania oceny. */
check(!/255,\s*255,\s*255/.test(p.picking.labelColor),
  `podpis suwaka ma kontrast na bialym tle: ${p.picking.labelColor}`);

console.log('\n--- jeden odslony kafelek na strone');
check(p.single.secondArmed === true, 'dotkniecie drugiego kafelka odslania go');
check(p.single.firstStillPicking === false && p.single.firstStillArmed === false,
  'pierwszy kafelek sklada sie sam');
check(p.single.armedCount === 1, `dokladnie jeden odslony (${p.single.armedCount})`);
/* Jeden otwarty suwak, nie zero: odkad jedno dotkniecie rozwija oceny od razu, dotkniecie
   DRUGIEGO kafelka sklada pierwszy i otwiera drugi. Pytanie brzmi „czy dokladnie jeden",
   bo dwa naraz to pytanie „ktory wlasnie wysylam", zadane w chwili wysylania. */
check(p.single.pickingCount === 1, `dokladnie jeden z otwartym suwakiem (${p.single.pickingCount})`);

console.log('\n--- wysylka otwiera okno z adresem');
check(p.dialog.open, 'okno otwarte dopiero po nacisnieciu wysylki');
check(p.dialog.score === '9', `okno niesie wybrana ocene: ${p.dialog.score}`);
check(Boolean(p.dialog.who), `okno mowi, o ktory pojazd chodzi: „${p.dialog.who}"`);
check(p.dialog.nameRequired === false, 'imie NIE jest wymagane');
check(p.dialog.emailRequired === false, 'adres NIE jest wymagany');
check(p.dialog.notifyPresent, 'jest zgoda na powiadomienie o wyniku');
check(p.dialog.notifyDisabled === true, 'zgoda wylaczona, dopoki nie ma adresu');
check(p.dialog.bodyLocked, 'tlo zablokowane przy otwartym oknie');

console.log('\n--- pasek u gory i szukanie');
check(p.chrome.timerShown, 'zegar widoczny na samej gorze');
check(p.chrome.timerSticky === 'sticky', `zegar jedzie z przewijaniem (${p.chrome.timerSticky})`);
check(Boolean(p.chrome.timerText), `zegar cos pokazuje: „${p.chrome.timerText}"`);
check(p.chrome.ruleGone, 'plakietki z regula nie ma');
check(p.chrome.progressGone, 'paska przewijania nie ma (zastapiony zegarem)');
check(p.chrome.navCurrentGone, 'plakietki „00% Voto del pubblico" nie ma');
check(p.chrome.searchShown, 'pole szukania widoczne przy dwudziestu wozach');

console.log(fails ? `\n${fails} niezaliczonych` : '\nwszystko zaliczone');
if (fails) process.exit(1);
