/**
 * Głosowanie w prawdziwej przeglądarce: strona główna i podstrona.
 *
 *     node tools/probe-voting.mjs [http://127.0.0.1:4173]
 *
 * PO CO
 *   check-voting.mjs sprawdza maszynę stanu bez przeglądarki i to jest właściwe miejsce na
 *   zegar. Ale nie odpowie na pytanie, czy przycisk jest ukryty, kiedy ma być ukryty, czy
 *   podium naprawdę się rysuje, czy dwie kolumny to naprawdę dwie kolumny i czy cel dotykowy
 *   ma 44 px — a to są cztery sposoby, w jakie to wszystko może zawieść, wyglądając w kodzie
 *   poprawnie.
 *
 * DWIE STRONY, BO GŁOSOWANIE MIESZKA NA DWÓCH
 *   Od wyniesienia ocen na `votazione.html` strona główna odpowiada za zaproszenie, chowanie
 *   dwóch pozostałych przycisków w hero, podium i wstrzymanie zapisów. Ocenianie — siatka,
 *   nakładka na zdjęciu, okno z adresem, klasyfikacja — jest na podstronie.
 *
 * TRZECIA SONDA, KTÓREJ TU NIE MA
 *   `tools/probe-vote-veil.mjs` mierzy samą interakcję na kafelku w czterdziestu punktach:
 *   krycie nakładki, morfowanie przycisku w suwak, cele dotykowe, jeden odsłonięty kafelek na
 *   stronę. Ta sonda przechodzi tę drogę najkrótszym możliwym sposobem i pyta o to, czego
 *   tamta nie dotyka. Podział jest celowy: dwie sondy mierzące to samo rozjeżdżają się przy
 *   pierwszej zmianie i wtedy nie wiadomo, która kłamie.
 *
 * DLACZEGO PRZEZ cdp.mjs, A NIE PRZEZ --dump-dom
 *   Poprzednia wersja wstrzykiwała skrypt w pobrany HTML i zrzucała DOM przy
 *   `--virtual-time-budget`. Przestało to działać i objaw był najgorszy z możliwych: „sonda nie
 *   wystartowala" plus pięćset znaków cudzego HTML-a. Zmierzone: Chrome zrzucał DOM w połowie
 *   sondy, po przełączeniu fazy i przed dołożeniem znacznika, bo budżet czasu wirtualnego
 *   zużywają też pętle rysowania strony, a nie tylko `sleep` w sondzie. Podniesienie budżetu z
 *   40 s do 90 s nic nie zmieniło.
 *
 *   cdp.mjs chodzi po Chrome DevTools Protocol w prawdziwym czasie — bez zamrożonego rAF, bez
 *   budżetu, z prawdziwym `setTimeout`. Ten sam powód opisany jest w jego nagłówku.
 *
 *   Podglądowy serwer nie ma Workera, a `?demo=1` i tak wygrywa z serwerem. To nie jest
 *   obejście testu: to jest jedyny stan, w jakim te strony istnieją przed dniem zawodów.
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4173';

let fails = 0;
const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

function probe(file, url, width = 1280, height = 1000) {
  const raw = execFileSync(process.execPath, [
    'tools/cdp.mjs', 'probe', file,
    '--w', String(width), '--h', String(height),
    '--url', url, '--origin', base, '--wait', '3000'
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(raw);
  } catch (_) {
    console.log(`Sonda ${file} nie oddala JSON-a:\n${raw.slice(0, 900)}`);
    process.exit(1);
  }
}

/* ============================================================ strona główna */

const h = probe('tools/probe-voting-home.js', '/index.html?demo=1&skipIntro=1&lang=pl');
console.log(`STRONA GLOWNA — bledy konsoli: ${h.consoleErrors?.length ? h.consoleErrors.join(' | ') : 'brak'}\n`);
check((h.consoleErrors || []).length === 0, 'zero bledow JavaScriptu');
check(h.demoBarPresent, 'tryb demo dolozyl przelacznik faz');
check(h.votingSectionGone, 'sekcji ocen nie ma na stronie glownej (przeniesiona na podstrone)');
check(h.voteDialogGone, 'okna oceny nie ma na stronie glownej');

console.log('\n--- faza 1: przed startem');
const a = h.scheduled;
check(a.podiumShown === false, 'podium ukryte');
check(a.ctaShown.every((v) => v === false), `przycisk „zaglosuj" ukryty w ${a.ctaShown.length} miejscach`);
check(a.ctaHref === 'votazione.html', `zaproszenie prowadzi na podstrone: ${a.ctaHref}`);
check(a.raceHideShown >= 2, `„Zapisz sie" i „Bede tam" widoczne (${a.raceHideShown})`);
check(a.signupLocked === false && a.submitDisabled === false, 'zapisy otwarte');
check(a.signupLinks.length > 0 && a.signupLinks.every((v) => v === false),
  `odsylacze „Zapisz sie" dzialaja (${a.signupLinks.length})`);
check(a.demoBarFixed === 'fixed', `pasek demo przypiety do okna: ${a.demoBarFixed}`);
check(a.skipShown, '„Zakoncz odliczanie" widoczne przed startem');

console.log('\n--- „Zakoncz odliczanie"');
const s = h.afterSkip;
check(s.ctaShown.some((v) => v === true), 'po przejsciu przez zero pojawia sie przycisk „zaglosuj"');
check(s.signupLocked && s.submitDisabled, 'zapisy zablokowane bez klikania w faze');
check(s.skipShown === false, '„Zakoncz odliczanie" znika, gdy nie ma czego konczyc');

console.log('\n--- faza 2: glosowanie otwarte');
const b = h.voting;
check(b.ctaShown.some((v) => v === true), 'przycisk „zaglosuj" widoczny');
/* Zgłoszone wprost: „jak sie pojawia to zaglosuj na uczestnika, to te guziki od dolu dwa to sie
   ukrywaja". Nie wyszarzone — schowane. */
check(b.raceHideShown === 0, `„Zapisz sie" i „Bede tam" schowane na czas wyscigu (${b.raceHideShown})`);
check(b.heroButtons.length === 1, `w hero zostaje jeden przycisk: ${b.heroButtons.join(' | ')}`);
check(b.signupLocked && b.submitDisabled, 'zapisy zablokowane w trakcie wyscigu');
check(b.signupLinks.every((v) => v === true),
  `wszystkie odsylacze „Zapisz sie" oznaczone jako nieczynne (${b.signupLinks.length})`);
check(h.signupClick.visible && h.signupClick.toast.length > 0,
  `klik w „Zapisz sie" tlumaczy, co sie dzieje: „${h.signupClick.toast.slice(0, 46)}…"`);
check(Math.abs(h.signupClick.offCentreBy) <= 2,
  `pasek komunikatow wysrodkowany w oknie (odchylenie ${h.signupClick.offCentreBy} px)`);

console.log('\n--- faza 3: podium');
const c = h.closed;
check(c.podiumShown, 'podium widoczne');
check(c.podiumCards === 3, `trzy karty zwyciezcow: ${c.podiumCards}`);
check(c.svgBlocks === 3, `trzy stopnie cokolu, po jednym na karte: ${c.svgBlocks}`);
check(c.podiumPlaces.join(' | ').startsWith('1:'), `kolejnosc w tresci to 1,2,3: ${c.podiumPlaces.join(' | ')}`);
check(c.ctaShown.every((v) => v === false), 'przycisk „zaglosuj" znowu ukryty');
check(c.raceHideShown >= 2, 'dwa przyciski w hero wracaja po zamknieciu');
check(c.signupLocked === false && c.submitDisabled === false, 'zapisy odblokowane po zamknieciu');
check(c.signupLinks.every((v) => v === false), 'odsylacze „Zapisz sie" znowu dzialaja');

/* ============================================================ podstrona, telefon */

/* 390×844, nie 1280: dwie kolumny i cele po 44 px mają znaczenie na telefonie, a na monitorze
   przeszłyby zawsze. Podstrona jest tym, co ktoś otwiera na ulicy między zjazdami. */
const p = probe('tools/probe-voting-page.js', '/votazione.html?demo=1&lang=pl', 390, 844);
console.log(`\n\nPODSTRONA (390x844) — bledy konsoli: ${p.consoleErrors?.length ? p.consoleErrors.join(' | ') : 'brak'}\n`);
check((p.consoleErrors || []).length === 0, 'zero bledow JavaScriptu');

console.log('\n--- naglowek: jedna nagroda publicznosci');
const head = p.head;
check(head.lang === 'pl', `jezyk z adresu: ${head.lang}`);
check(/nagroda publiczno/i.test(head.h1), `naglowek mowi, o co chodzi: „${head.h1}"`);
check(head.awardTabs === 0, `nie ma zakladek nagrod (publicznosc przyznaje jedna): ${head.awardTabs}`);
check(head.ruleBadgeGone, 'plakietki z regula nie ma — regula jest w akapicie i w oknie oceny');
check(/opcjonaln/i.test(head.lead), `akapit mowi, ze imie i adres sa opcjonalne: „${head.lead.slice(0, 62)}…"`);
check(head.languageButtons === 6, `szesc jezykow do wyboru: ${head.languageButtons}`);
check(head.eventClock === false, 'na podstronie NIE ma licznika odliczania do wydarzenia');
check(head.timerShown, 'ale JEST zegar glosowania w przyklejonym pasku');
check(head.signupLinks === 0, 'na podstronie NIE ma odsylacza „Zapisz sie"');
check(head.attendButtons === 0, 'na podstronie NIE ma przycisku „Bede tam"');
check(head.photoIsTarget, 'zdjecie jest celem dotkniecia');
check(head.mineShown === false, 'panel „Twoj glos" ukryty, dopoki nie ma glosu');

console.log('\n--- filtr kategorii pojazdu');
const f = p.filters;
check(f.shown, 'filtr widoczny przy wiecej niz jednej kategorii');
check(f.labels.length >= 3, `pierwszy przycisk to „wszystkie" plus kategorie: ${f.labels.join(' | ')}`);
check(f.activeFirst, '„wszystkie" jest wybrane na wejsciu');
check(f.smallestTarget >= 44, `cel dotykowy filtra: ${f.smallestTarget} px`);
check(f.afterPick.cards > 0 && f.afterPick.cards < p.batch.after,
  `wybor kategorii zawezil liste: ${p.batch.after} -> ${f.afterPick.cards}`);
check(f.afterPick.allSameCategory, `w liscie zostaly tylko „${f.afterPick.label}"`);
check(f.afterReset >= f.afterPick.cards, 'powrot na „wszystkie" przywraca liste');

console.log('\n--- siatka i doczytywanie porcjami');
const g = p.batch;
check(g.columns === 2, `dwie kolumny: ${g.columns}`);
check(g.first === 12, `pierwsza porcja to dwanascie kafelkow: ${g.first}`);
check(g.moreShown, `„Pokaz wiecej" widoczne, gdy zostalo wiecej: „${g.moreLabel}"`);
check(g.after > g.first, `porcja doklada kafelki: ${g.first} -> ${g.after}`);
check(g.moreShownAfter === false, 'przycisk znika, gdy nie ma czego doczytac');

/* Geometrie nakladki, morfowanie przycisku w suwak i cele dotykowe mierzy
   tools/probe-vote-veil.mjs. Tu sprawdzamy tylko, ze droga jest przejezdna. */
console.log('\n--- droga do glosu: dotkniecie, przycisk, suwak');
check(p.armed.cardArmed, 'dotkniecie zdjecia odslania nakladke');
check(p.armed.ctaLabel.length > 0, `zaproszenie ma napis: „${p.armed.ctaLabel}"`);
check(p.picking.cardPicking, 'klik w zaproszenie otwiera wybor oceny');
check(p.picking.range === '3-10', `zakres ocen z serwera: ${p.picking.range}`);
check(p.picking.openPickers === 1, `dokladnie jeden otwarty wybor na strone: ${p.picking.openPickers}`);
check(p.picking.readout === '8', `suwak pokazuje wybrana ocene: „${p.picking.readout}"`);
check(p.picking.sendLabel.length > 0, `wysylka ma napis: „${p.picking.sendLabel}"`);

console.log('\n--- okno z adresem');
const s3 = p.step3;
check(s3.open, 'okno otwiera sie dopiero po nacisnieciu wysylki');
check(s3.bodyLocked, 'tlo zablokowane, gdy okno jest otwarte');
check(s3.who.length > 0, `okno mowi, o ktory pojazd chodzi: „${s3.who}"`);
check(s3.rider.length > 0, `okno mowi, czyj to pojazd: „${s3.rider}"`);
check(s3.score === '8', `okno niesie wybrana ocene: ${s3.score}`);
check(s3.formShown && s3.knownShown === false, 'bez zapamietanego adresu widac pola');
/* Odwrotnie niz przed zmiana: adres jest OPCJONALNY, glos bez niego przechodzi. Kosztem
   jest brak zmiany i brak wiadomosci o wyniku — i to jest widoczne w oknie, bo zgoda na
   powiadomienie jest wylaczona az do wpisania adresu. */
check(s3.nameRequired === false, 'imie NIE jest wymagane');
check(s3.emailRequired === false, 'adres NIE jest wymagany');
check(s3.notifyDisabled === true, 'zgoda na wynik wylaczona, dopoki nie ma adresu');
check(s3.notifyEnabledWithEmail === true, 'wpisanie adresu wlacza zgode na wynik');

console.log('\n--- po oddaniu glosu');
const v = p.afterVote;
check(v.dialogClosed, 'okno zamkniete po wyslaniu');
/* Ten warunek raz już upadł i dlatego jest tu osobno. `dialog.close()` wykonało się, okno się
   zamknęło, a zdarzenie `close` nie wystąpiło ani razu — a było jedynym miejscem, w którym
   zdejmowana była blokada przewijania. Na ekranie wygląda to jak zawieszona strona: nic nie
   widać i nie da się przewinąć. */
check(v.bodyUnlocked, `tlo odblokowane, strona da sie przewijac (klasy body: „${v.bodyClasses}")`);
check(v.mineShown, 'panel „Twoj glos" pojawia sie nad lista');
check(v.mineScore === '8', `panel niesie ocene: ${v.mineScore}`);
check(v.mineCart.length > 0, `panel mowi, na kogo poszedl glos: „${v.mineCart}"`);
check(v.mineNoteShown, 'panel tlumaczy, ze zmiana idzie odsylaczem z maila');
check(v.votedCards === 1, `dokladnie jeden kafelek oznaczony jako oceniony: ${v.votedCards}`);
check(v.mineBadges === 1, `plakietka „twoj glos" na jednym zdjeciu: ${v.mineBadges}`);
check(v.yourScore.includes('8'), `kafelek pokazuje wlasna ocene: „${v.yourScore}"`);
/* GLOS PODPISANY ADRESEM WOLNO RAZ ZMIENIC, WIEC KAFELKI NIE MOWIA „NIE".
   ---------------------------------------------------------------------------
   Stalo tu odwrotnie: „pozostale kafelki mowia, ze glos jest juz oddany" i „zadne zdjecie nie
   zaprasza juz do glosowania". Oba przechodzily, ale mierzyly USTERKE TRYBU DEMO, a nie strone.

   Demo zapisywalo glos jako `{ participantId, score }` bez `canChange`, czyli z `undefined`,
   czyli falszem — a wtedy kafelek nie dostaje nakladki i pokazuje zdanie o zuzytej zmianie.
   Prawdziwy Worker oddaje `canChange: identified && editsLeft > 0`, a ta sonda wpisuje w okno
   imie i adres, wiec na produkcji glos JEST podpisany i jedna zmiana przysluguje: wlasny kafelek
   zaprasza do poprawienia oceny, pozostale do przeniesienia glosu.

   Po zrownaniu demo z serwerem (patrz `demoDriven` w send() w voting-page.js) asercje musialy
   sie odwrocic. Stan „nie ma juz czego dotknac" nalezy do glosu ANONIMOWEGO i ma wlasna sonde. */
check(v.usedOnOthers === 0, `kafelki nie mowia „nie", bo glos podpisany wolno raz zmienic (${v.usedOnOthers})`);
check(v.hitsLeft > 0, `zdjecia dalej przyjmuja dotkniecie, zeby dalo sie przeniesc glos: ${v.hitsLeft}`);
check(v.armedLeft === 0, `zaden kafelek nie zostal odslony: ${v.armedLeft}`);
check(v.toastTone === 'success', `pasek w odmianie potwierdzenia: ${v.toastTone}`);

/* Wynik ma JEDEN widok: podium i pelna tabela. Siatka kart po zamknieciu jest celowo pusta —
   patrz komentarz przy galezi `closed` w paintGrid. Poprzednia wersja tych asercji szukala
   rankingu na kafelkach i przy pustej siatce polowa przechodzila trywialnie, bo zero rowna
   sie zero: sonda mowila „ok" o stronie, na ktorej nie bylo niczego. */
console.log('\n--- faza 3: klasyfikacja nagrody publicznosci');
const cl = p.closed;
check(cl.hits === 0, `po zamknieciu nie da sie glosowac: ${cl.hits} celow dotkniecia`);
check(cl.gridCards === 0, `siatka kart ustepuje miejsca wynikowi: ${cl.gridCards} kafelkow`);
check(cl.timerShown, 'zegar zostaje i mowi, ze glosowanie jest zamkniete');
check(cl.resultsShown, 'sekcja wynikow widoczna');
check(cl.podiumEmpty === 0, 'podium ma zwyciezcow, a nie komunikat „brak glosow"');
check(cl.podiumPlaces.join(',') === '1,2,3', `trzy miejsca na podium po kolei: ${cl.podiumPlaces.join(',')}`);
check(cl.standingsRows === 10, `pierwsza porcja tabeli to dziesiec wierszy: ${cl.standingsRows}`);
check(cl.firstRank === '1', `pierwszy wiersz tabeli to pierwsze miejsce: ${cl.firstRank}`);
/* Porcje po dziesiec, jak w cokole na stronie glownej. Do tej zmiany tabela rysowala CALA
   stawke od razu i przy osiemdziesieciu wozach zjezdzala na trzy ekrany, wypychajac podium
   poza widok — czyli to, po co ktos w ogole wchodzi na te strone. */
check(cl.moreShown, `„Pokaz wiecej" widoczne, gdy zostalo wiecej: „${cl.moreLabel}"`);
check(cl.after.rows === 20, `porcja doklada dziesiec wierszy: ${cl.standingsRows} -> ${cl.after.rows}`);
check(cl.after.lastRank === '20', `numeracja liczy od pelnej klasyfikacji: ostatni to ${cl.after.lastRank}`);
check(cl.after.moreShown === false, 'przycisk znika, gdy nie ma czego doczytac');
check(cl.after.innerScroll === 'unfolded' || cl.after.innerScroll === true,
  `tabela nie rozpycha sekcji: ${cl.after.innerScroll}`);
check(cl.scrollFocusable, 'tabele da sie przewijac z klawiatury');
/* Na telefonie tabela rozklada sie na kartki. Trzy liczby — punkty, srednia, glosy — musza
   stac KAZDA w swojej kolumnie: przy jednej komorce dwucyfrowa suma nachodzila na srednia. */
const nc = cl.numberColumns;
check(nc?.count === 3, `trzy liczby w wierszu: ${nc?.count}`);
check(nc?.distinct === 3, `kazda w swojej kolumnie: ${nc?.distinct} roznych pozycji`);
check(nc?.ascending, 'kolumny ida po kolei w prawo');
check(nc?.overlap === false, 'zadna liczba nie nachodzi na nastepna');
check(cl.sorted, `kolejnosc jest wynikiem: ${cl.points.slice(0, 5).join(' > ')}`);
check(cl.kicker.length > 0, `naglowek mowi, ze to wynik: „${cl.kicker}"`);

console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
process.exitCode = fails ? 1 : 0;
