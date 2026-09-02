/**
 * Ocenianie na zdjęciu, zmierzone w przeglądarce.
 *
 *     node tools/probe-vote-veil.mjs http://127.0.0.1:4173
 *
 * Okno 390×844 i tryb demo, tak samo jak w probe-voting.mjs: dwie kolumny i cele po 44 px mają
 * znaczenie na telefonie, a na monitorze przeszłyby zawsze. Poniżej 700 px harness włącza
 * emulację palca, więc `hover: none` jest tu prawdziwe — i tylko dlatego da się tą sondą
 * sprawdzić, że pigułka „Zagłosuj" jest widoczna BEZ najeżdżania kursorem.
 *
 * KONTRAKT: NAPIS WIDAĆ W SPOCZYNKU, JEDNO KLIKNIĘCIE ROZWIJA SUWAK, WYSYŁKA OTWIERA OKNO.
 *   Zamówienie, dosłownie: „jak klikam w zdjęcie żeby zagłosować to chciałbym żeby pokazał się
 *   tam napis zagłosuj i po kliknięciu wtedy z tego guzika rozsuwa się ten pop out z suwakiem
 *   i jak się klika zagłosuj to wtedy pokazuje się to z e-mailem".
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

/* SPOCZYNEK: NAPIS „ZAGLOSUJ" MA BYC WIDAC, BEZ NAJEZDZANIA I BEZ DOTYKANIA.
   ---------------------------------------------------------------------------
   Stalo tu „nakladka niewidoczna w spoczynku (krycie 0)" — opis stanu, ktory pod palcem byl
   przyczyna zgloszenia „klikam w zaglosuj i nic sie nie robi": `:hover` na telefonie nie
   istnieje, wiec zaproszenia nie bylo widac nigdy, a pierwsze dotkniecie szlo na odslonienie
   pigulki wyrastajacej pod kciukiem. Teraz arkusz odslania nakladke w spoczynku przy
   `hover: none`, wiec warunek jest odwrotny: krycie 1, pigulka z pudelkiem i z kontrastem. */
console.log('\n--- spoczynek: na zdjeciu widac napis „Zaglosuj" (pod palcem)');
check(p.rest.cards >= 2, `kafelki sa (${p.rest.cards})`);
check(p.rest.hasVeil && p.rest.hasCta, 'nakladka i zaproszenie istnieja w drzewie');
check(p.rest.hoverNone === true, `okno bez hovera, czyli mierzymy palec (hover:none=${p.rest.hoverNone})`);
check(p.rest.veilOpacity === 1, `pigulka widoczna bez dotykania (krycie nakladki ${p.rest.veilOpacity})`);
check(p.rest.veilEvents === 'none', `tlo nakladki nie odbiera dotkniec przezroczystemu celowi (${p.rest.veilEvents})`);
check(p.rest.ctaEvents === 'auto', `sama pigulka lapie dotkniecie (${p.rest.ctaEvents})`);
check(/gradient/.test(p.rest.veilBackdrop), `pod napisem jest przygaszenie, nie gola fotografia: ${p.rest.veilBackdrop}`);
/* KONTRAST DO WLASNEGO TLA PIGULKI, nie do fotografii: zdjecie bywa dowolne, a jedyna liczba,
   ktora nie zalezy od tego, co organizator wgral, to napis na zoltym tle pigulki. */
check(Number(p.rest.ctaContrast) >= 4.5, `napis na pigulce ma kontrast ${p.rest.ctaContrast}:1`);
check(p.rest.ctaHeight >= 44, `cel dotykowy pigulki (w spoczynku): ${p.rest.ctaWidth}x${p.rest.ctaHeight} px`);
check(p.rest.ctaInsidePhoto, 'pigulka stoi NA zdjeciu, nie pod nim');
check(Boolean(p.rest.ctaLabel), `pigulka ma napis: „${p.rest.ctaLabel}"`);
check(p.rest.pickHidden === true, 'suwak schowany, dopoki nikt nie nacisnie');
check(p.rest.buttonsUnderPhoto === 0, `zero przyciskow POD zdjeciem (${p.rest.buttonsUnderPhoto})`);
check(p.rest.hasHit, 'przezroczysty cel na calym zdjeciu: dotkniecie OBOK napisu robi to samo');

/* JEDNO KLIKNIECIE, NIE DWA — I TO JEST TERAZ MOZLIWE, BO PIGULKE WIDAC.
   ---------------------------------------------------------------------------
   Stalo tu przez chwile „suwak jeszcze schowany", czyli stan POSREDNI: pierwsze dotkniecie
   tylko odslanialo pigulke. Mialo sens wylacznie wtedy, gdy pigulka byla ukryta — teraz taki
   krok nie odslanialby niczego i bylby dotknieciem, po ktorym nic sie nie zmienia. */
console.log('\n--- jedno klikniecie: suwak od razu');
check(p.armed.cardArmed, 'kafelek oznaczony jako odslony');
check(p.armed.veilOpacity === 1, `nakladka widoczna (krycie ${p.armed.veilOpacity})`);
check(p.armed.veilEvents === 'auto', 'nakladka lapie wskaznik, gdy stoi na niej wybor');
check(p.armed.hitHidden === true, 'przezroczysta warstwa schodzi z drogi suwakowi');
check(p.armed.pickHidden === false, 'JEDNO klikniecie rozwija suwak, bez drugiego');

console.log('\n--- pigulka przeistacza sie w suwak, w swoim miejscu');
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
check(p.single.secondArmed === true, 'klikniecie drugiego kafelka odslania go');
check(p.single.firstStillPicking === false && p.single.firstStillArmed === false,
  'pierwszy kafelek sklada sie sam');
check(p.single.armedCount === 1, `dokladnie jeden odslony (${p.single.armedCount})`);
/* Jeden otwarty suwak, nie zero: odkad jedno klikniecie rozwija oceny od razu, klikniecie
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

/* ZEGAR STOI W TRESCI, A JEGO KOPIA W PASKU — I TO NIE JEST USTERKA.
   Stalo tu „zegar jedzie z przewijaniem (sticky)" i dwa warunki o rzeczach, ktorych „nie ma":
   pasku postepu i plakietce z procentem. Wszystkie trzy opisywaly wczesniejsza wersje
   podstrony. Dzis zegar jest zwyklym elementem tresci pod naglowkiem sekcji, a przy przewijaniu
   w dol wjezdza w pasek jego KOPIA (`[data-vote-timer-dock]`, `.nav-clock--vote`); pasek postepu
   i plakietka sa na tej podstronie te same co na stronie glownej, bo maluje je ten sam arkusz.
   Warunki opisuja wiec stan faktyczny — patrz komentarze w votazione.html. */
console.log('\n--- zegar, pasek u gory i szukanie');
check(p.chrome.timerShown, 'zegar widoczny w tresci strony');
check(p.chrome.timerInFlow !== 'sticky' && p.chrome.timerInFlow !== 'fixed',
  `zegar jest zwyklym elementem tresci, nie przyklejonym (${p.chrome.timerInFlow})`);
check(p.chrome.timerDockPresent, 'kopia zegara czeka w pasku nawigacji');
check(Boolean(p.chrome.timerText), `zegar cos pokazuje: „${p.chrome.timerText}"`);
check(p.chrome.ruleGone, 'plakietki z regula nie ma');
check(p.chrome.progressPresent, 'pasek postepu jest, ten sam co na stronie glownej');
check(p.chrome.navCurrentPresent, 'plakietka z procentem jest, ta sama co na stronie glownej');
check(p.chrome.searchShown, 'pole szukania widoczne przy dwudziestu wozach');

console.log(fails ? `\n${fails} niezaliczonych` : '\nwszystko zaliczone');
if (fails) process.exit(1);
