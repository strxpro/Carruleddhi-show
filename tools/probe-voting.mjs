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
 *   dwóch pozostałych przycisków w hero, podium i wstrzymanie zapisów. Ocenianie — dwanaście
 *   nagród, siatka, trzy kroki przy pojeździe, okno z adresem — jest na podstronie.
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
check(c.svgBlocks === 3, `trzy schodki w rysunku SVG: ${c.svgBlocks}`);
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

console.log('\n--- naglowek i dwanascie nagrod');
const head = p.head;
check(head.lang === 'pl', `jezyk z adresu: ${head.lang}`);
check(head.awardTabs === 12, `dwanascie zakladek nagrod: ${head.awardTabs}`);
check(head.awardLabels.every((label) => label && !label.startsWith('prize.')),
  `nazwy nagrod przetlumaczone, nie klucze: ${head.awardLabels.slice(0, 2).join(' | ')}`);
check(new Set(head.awardLabels).size === 12, 'dwanascie roznych nazw');
check(head.languageButtons === 6, `szesc jezykow do wyboru: ${head.languageButtons}`);
check(head.progress.includes('/ 12'), `licznik nagrod: ${head.progress}`);
check(head.clock === false, 'na podstronie NIE ma licznika czasu');
check(head.signupLinks === 0, 'na podstronie NIE ma odsylacza „Zapisz sie"');
check(head.attendButtons === 0, 'na podstronie NIE ma przycisku „Bede tam"');
check(head.photoIsButton === false, 'zdjecie nie jest przyciskiem');

console.log('\n--- siatka i doczytywanie porcjami');
const g = p.batch;
check(g.columns === 2, `dwie kolumny: ${g.columns}`);
check(g.first === 12, `pierwsza porcja to dwanascie kafelkow: ${g.first}`);
check(g.moreShown, `„Pokaz wiecej" widoczne, gdy zostalo wiecej: „${g.moreLabel}"`);
check(g.after > g.first, `porcja doklada kafelki: ${g.first} -> ${g.after}`);
check(g.moreShownAfter === false, 'przycisk znika, gdy nie ma czego doczytac');

console.log('\n--- trzy kroki przy pojezdzie');
const s1 = p.step1;
check(s1.startHidden && s1.pickerShown, 'przycisk „Zaglosuj" ustepuje miejsca ocenom');
check(s1.openPickers === 1, `dokladnie jeden otwarty wybor na strone: ${s1.openPickers}`);
check(s1.labels === '3,4,5,6,7,8,9,10', `oceny od 3 do 10: ${s1.labels}`);
check(s1.smallestTarget >= 44, `najmniejszy cel dotykowy: ${s1.smallestTarget} px`);
check(s1.rows === 2, `oceny w dwoch rzedach po cztery, nie w jednym po osiem: ${s1.rows}`);
check(s1.confirmDisabled, 'potwierdzenie wylaczone, dopoki nie ma oceny');
check(p.step2.confirmDisabled === false, 'wybor oceny odblokowuje potwierdzenie');
check(p.step2.picked === '8', `zaznaczona dokladnie jedna ocena: ${p.step2.picked}`);

console.log('\n--- okno z adresem');
const s3 = p.step3;
check(s3.open, 'okno otwiera sie dopiero po potwierdzeniu oceny');
check(s3.bodyLocked, 'tlo zablokowane, gdy okno jest otwarte');
check(s3.award.length > 0, `okno mowi, o ktora nagrode chodzi: „${s3.award}"`);
check(s3.who.length > 0, `okno mowi, o ktory pojazd chodzi: „${s3.who}"`);
check(s3.score === '8', `okno niesie wybrana ocene: ${s3.score}`);
check(s3.formShown && s3.knownShown === false, 'bez zapamietanego adresu widac pola');
check(s3.blockedWhenEmpty, 'puste imie i adres zatrzymuja wysylke');

console.log('\n--- po oddaniu glosu');
const v = p.afterVote;
check(v.dialogClosed, 'okno zamkniete po wyslaniu');
/* Ten warunek raz już upadł i dlatego jest tu osobno. `dialog.close()` wykonało się, okno się
   zamknęło, a zdarzenie `close` nie wystąpiło ani razu — a było jedynym miejscem, w którym
   zdejmowana była blokada przewijania. Na ekranie wygląda to jak zawieszona strona: nic nie
   widać i nie da się przewinąć. */
check(v.bodyUnlocked, `tlo odblokowane, strona da sie przewijac (klasy body: „${v.bodyClasses}")`);
check(v.progress.startsWith('1 /'), `licznik nagrod przeskoczyl: ${v.progress}`);
check(v.doneTabs === 1, `dokladnie jedna zakladka odhaczona: ${v.doneTabs}`);
check(v.votedCards === 1, `dokladnie jeden kafelek oznaczony jako oceniony: ${v.votedCards}`);
check(v.yourScore.includes('8'), `kafelek pokazuje wlasna ocene: „${v.yourScore}"`);
check(v.usedOnOthers > 0, `pozostale kafelki mowia, ze glos w tej nagrodzie jest oddany (${v.usedOnOthers})`);
check(v.startButtonsLeft === 0, 'w tej nagrodzie nie ma juz na co kliknac');
check(v.toastTone === 'success', `pasek w odmianie potwierdzenia: ${v.toastTone}`);

console.log('\n--- druga nagroda jest osobnym glosem');
const sa = p.secondAward;
check(sa.startButtons > 0, `w drugiej nagrodzie znowu da sie glosowac (${sa.startButtons})`);
check(sa.usedNotes === 0, 'druga nagroda nie jest oznaczona jako wykorzystana');
check(sa.activeLabel.length > 0, `wybrana zakladka: „${sa.activeLabel}"`);

console.log('\n--- zapamietany adres');
const r = p.remembered;
check(r.open && r.knownShown, 'okno proponuje zapamietany adres');
check(r.email === 'marco@example.com', `adres pokazany w calosci: ${r.email}`);
check(r.formShown === false, 'pola ukryte, dopoki propozycja stoi');
check(r.afterOtherFormShown && r.afterOtherKnownShown === false, '„Uzyj innego adresu" odslania pola');

console.log('\n--- faza 3: ranking nagrody');
const cl = p.closed;
check(cl.startButtons === 0, 'po zamknieciu nie da sie glosowac');
check(cl.stats === cl.cards && cl.cards > 0, `srednie przy kazdym kafelku (${cl.stats}/${cl.cards})`);
check(cl.ranks === cl.cards, 'kazdy kafelek ma miejsce w rankingu');
check(cl.firstRank === '#1', `pierwszy kafelek to pierwsze miejsce: ${cl.firstRank}`);
check(cl.ordersDiffer, 'kazda nagroda ma wlasny ranking, a nie ten sam dwanascie razy');

console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
process.exitCode = fails ? 1 : 0;
