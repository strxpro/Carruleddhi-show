/**
 * Builds the printable registration forms — twelve PDFs, six languages, two age groups.
 *
 *     node tools/build-pdfs.mjs            blank forms, the ones the site serves
 *     node tools/build-pdfs.mjs --sample   the same layout filled with example data
 *
 * Output lands in public/emails/:
 *
 *     Carruleddhi-modulo-it.pdf   … -pl -en -de -es -fr     18 and over
 *     Carruleddhi-minori-it.pdf   … -pl -en -de -es -fr     under 18
 *     Carruleddhi-modulo.pdf                                copy of the Italian adult
 *     Carruleddhi-modulo-minori.pdf                         copy of the Italian minor
 *
 * The last two keep their old names because the deployed site, the older instructions
 * and any link already sent to a participant all point at them. They are the Italian
 * versions, which is what those links always meant.
 *
 * WHY BLANK BY DEFAULT
 *   One file is served to every rider, so it cannot carry anybody's data. The previous
 *   generator filled in "Marco Rossi" and shipped that, which meant every participant
 *   received a form with a stranger's name, address and phone number printed on it.
 *   Here the personal fields become a writing line instead, and --sample is there for
 *   checking the layout without mailing somebody else's details around.
 *
 * WHY SIX FILES AND NOT ONE WITH SIX PAGES
 *   Only the Italian form is valid for the organisers. A foreign rider is mailed two
 *   attachments: the Italian one to sign, and their own language to read it by. Five
 *   translations bound into one document would mean printing a booklet to hand in one
 *   page, and page two would be the wrong language for five riders out of six.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'emails');
const SAMPLE = process.argv.includes('--sample');

const COPY = JSON.parse(readFileSync(join(ROOT, 'emails', 'pdf-copy.json'), 'utf8'));
const LOCALES = Object.keys(COPY).filter((key) => !key.startsWith('_'));

/* A writing line, for a field the rider fills in with a pen. Inline style rather than
   a class because it goes into a <dd> in one template and a <td> in the other, and a
   shared class would have to be kept in step in two stylesheets. */
const LINE = '<span style="display:inline-block;min-width:44mm;border-bottom:.6pt solid #9fb0cc;"></span>';

const EXAMPLE = {
  RACE_NUMBER: '039',
  FULL_NAME: 'Marco Rossi',
  BIRTH_DATE: '12.04.1994',
  POSTAL_CODE: '07028',
  PHONE: '+39 333 111 2233',
  EMAIL: 'marco.rossi@example.com',
  ADDRESS: 'Via Roma 4, 07028 Santa Teresa Gallura (SS)',
  CART_NAME: 'Fulmine di Gallura',
  CATEGORY: 'CLASSIC',
  TEAM: 'Squadra Nord',
  CART_NOTES: 'Freno a leva, ruote con cuscinetti',
  RIDER_AGE: '15',
  GUARDIAN_NAME: 'Anna Rossi',
  GUARDIAN_EMAIL: 'anna.rossi@example.com',
  GUARDIAN_PHONE: '+39 333 444 5566',
  MOTHER_NAME: 'Anna Rossi',
  FATHER_NAME: 'Luca Rossi'
};

/* Every personal field in either template, so a blank build can wipe them all.

   GUARDIAN_RELATION nie jest w EXAMPLE, bo jego wartość zależy od języka — tu
   dopisywana osobno w data(). Ale szablon nieletniego jej używa, więc dla każdego,
   kto wypełnia te formularze spoza tego pliku (funkcja na Vercelu, patrz eksport
   PRINT_DATA_KEYS na końcu), lista bez niej jest listą niekompletną: render() rzuca
   na nierozwiązanym {{GUARDIAN_RELATION}} i formularz nieletniego nie powstaje. */
const DATA_KEYS = [...Object.keys(EXAMPLE), 'GUARDIAN_RELATION'];

const stamp = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).format(new Date());

/* ------------------------------------------------------------------ helpers */

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Chrome or Edge not found. Install one of them, or set CHROME to its path.');
  return process.env.CHROME || found;
}

const li = (items) => items.map((item) => `<li>${item}</li>`).join('');

/**
 * The wording for one language, flattened to the L_* names the templates use.
 *
 * A flat map rather than a nested path lookup, because the renderer is a string
 * replace and nothing more. Anything that needed a decision — which checklist line
 * comes first, whether the "do not sign this one" banner appears at all — is decided
 * here, where it can be read, instead of inside the template.
 */
function wording(locale, minor, generatedAt = stamp) {
  const deck = COPY[locale];
  const isItalian = locale === 'it';

  /* Only the Italian form is handed in, so the other five say so at the top and again
     at the bottom, and their checklist asks for the Italian print-out rather than for
     the page in the rider's hands. */
  const warnBlock = isItalian ? '' : `<p class="warn">${deck.warn}</p>`;
  const bring = minor ? [...deck.bringMinor] : [...deck.bringAdult];
  if (!isItalian) bring[0] = deck.bringItalianForm;

  const footBase = minor ? deck.footMinor : deck.footAdult;
  const foot = [isItalian ? '' : deck.footNote, footBase.replace('%GENERATEDAT%', generatedAt)]
    .filter(Boolean)
    .join(' ');

  return {
    L_LANG: deck.lang,
    L_TITLE: minor ? deck.titleMinor : deck.titleAdult,
    L_BADGE: deck.badgeMinor,
    L_DATE_LINE: deck.dateLine,
    L_NUM_LABEL: deck.numLabel,
    L_WARN_BLOCK: warnBlock,
    L_SEC_RIDER: deck.secRider,
    L_SEC_MINOR_RIDER: deck.secMinorRider,
    L_SEC_GUARDIAN: deck.secGuardian,
    L_SEC_CART: deck.secCart,
    L_SEC_DECL: deck.secDecl,
    L_SEC_DECL_MINOR: deck.secDeclMinor,
    L_SEC_BRING: deck.secBring,
    L_F_NAME: deck.fName,
    L_F_BIRTH: deck.fBirth,
    L_F_AGE: deck.fAge,
    L_F_POSTAL: deck.fPostal,
    L_F_PHONE: deck.fPhone,
    L_F_EMAIL: deck.fEmail,
    L_F_ADDRESS: deck.fAddress,
    L_F_CART_NAME: deck.fCartName,
    L_F_CATEGORY: deck.fCategory,
    L_F_TEAM: deck.fTeam,
    L_F_NOTES: deck.fNotes,
    L_F_AS: deck.fAs,
    L_F_MOTHER: deck.fMother,
    L_F_FATHER: deck.fFather,
    L_F_ID_DOC: deck.fIdDoc,
    L_F_PLACE: deck.fPlace,
    L_F_DATE: deck.fDate,
    L_DECL_ADULT: deck.declAdult,
    L_MINOR_NOTE: deck.minorNote,
    L_DECL_MINOR_INTRO: deck.declMinorIntro,
    L_DECL_MINOR_ITEMS: li(deck.declMinor),
    L_FLAG_MINOR: deck.flagMinor,
    L_BRING_ITEMS: li(bring),
    L_SIGN_RIDER: deck.signRider,
    L_SIGN_GUARDIAN_OPT: deck.signGuardianOpt,
    L_SIGN_GUARDIAN_REQ: deck.signGuardianReq,
    L_SIGN_RIDER_OPT: deck.signRiderOpt,
    L_FOOT: foot
  };
}

/** The rider's own values: example data with --sample, otherwise a line to write on. */
function data(locale, minor) {
  if (!SAMPLE) {
    const blank = Object.fromEntries(DATA_KEYS.map((key) => [key, LINE]));
    // A number is assigned by the organiser, not written by the rider, so the box just
    // stays empty rather than inviting somebody to write in it.
    blank.RACE_NUMBER = '&nbsp;&nbsp;&nbsp;';
    blank.GUARDIAN_RELATION = LINE;
    return blank;
  }
  return {
    ...EXAMPLE,
    // A grown-up's birth date on a minors form would be nonsense to look at.
    ...(minor ? { FULL_NAME: 'Sara Rossi', BIRTH_DATE: '04.03.2011' } : {}),
    GUARDIAN_RELATION: COPY[locale].rel.mother
  };
}

function render(template, values) {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`{{${key}}}`).join(String(value));
  }
  const leftover = [...new Set((html.match(/\{\{[A-Z_]+\}\}/g) || []))];
  if (leftover.length) throw new Error(`unfilled placeholders: ${leftover.join(', ')}`);
  return html;
}

function toPdf(chrome, html, outFile) {
  const temp = join(tmpdir(), `carruleddhi-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(temp, html, 'utf8');
  try {
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${outFile}`,
      `--user-data-dir=${join(tmpdir(), 'carruleddhi-pdf-profile')}`,
      `file:///${temp.replace(/\\/g, '/')}`
    ], { stdio: 'ignore' });
  } finally {
    rmSync(temp, { force: true });
  }
  if (!existsSync(outFile)) throw new Error(`Chrome produced nothing for ${outFile}`);
}

/* ===========================================================================
   GDZIE NA STRONIE STOI KAŻDE POLE — mapa dla funkcji, która wypełnia PDF
   ===========================================================================
   PO CO
     Załącznik w mailu ma przyjść z wpisanymi danymi. Pliki tutaj są puste i jeden służy
     wszystkim, więc wypełnienie musi się dziać przy zgłoszeniu — a funkcja na Vercelu nie ma
     Chrome i nie ma jak wyrenderować HTML-a od nowa.

     Nie musi. Wystarczy DOPISAĆ tekst na gotowej stronie: pdf-lib rysuje napis w podanym
     punkcie i niczego poza tym nie rusza. Układ zostaje dokładnie taki, jaki wyszedł z
     Chrome — łącznie z tym, że wszystko mieści się na jednej stronie, co kosztowało dwa
     przebiegi pomiarów i czego żadna biblioteka PDF nie odtworzyłaby sama.

     Brakuje jednego: współrzędnych. Stąd ten przebieg.

   DLACZEGO POMIAR, A NIE WYLICZENIE
     Pozycje wynikają z układu: siatki, zawijania etykiet, długości tłumaczeń. Włoskie
     „Nome e cognome" i niemieckie „Vor- und Nachname" łamią się inaczej i przesuwają wiersze
     pod sobą. Policzyć tego z arkusza się nie da; można za to zapytać Chrome, który i tak
     składa te strony linijkę niżej.

   DLACZEGO W UKŁADZIE DRUKU
     `Emulation.setEmulatedMedia('print')` plus okno wielkości pola zadruku. Bez tego mierzy
     się układ ekranowy — inna szerokość, inne łamanie, inne wiersze. Pole zadruku to A4 minus
     marginesy z `@page`, przeliczone na piksele CSS (96 dpi).

   CO WRACA
     Dla każdego pola: prostokąt KOMÓRKI (stąd szerokość, w którą tekst ma się zmieścić) i
     dolna krawędź LINII do pisania (stąd linia bazowa — napis siada na kresce dokładnie tam,
     gdzie usiadłby długopis). Wszystko w punktach PDF, licząc od lewego dolnego rogu strony,
     bo w tym układzie współrzędnych rysuje pdf-lib.
   =========================================================================== */

const MM_PER_IN = 25.4;
const A4 = { w: 210, h: 297 };
const PX_PER_MM = 96 / MM_PER_IN;
const PT_PER_MM = 72 / MM_PER_IN;
const PT_PER_PX = 72 / 96;

/**
 * Marginesy odczytane z `@page` SZABLONU, nie wpisane tutaj.
 *
 * DWA SZABLONY MAJĄ RÓŻNE MARGINESY I TO KOSZTOWAŁO JEDEN PRZEBIEG POMIARÓW.
 *   Dorosły ma `margin: 11mm 12mm`, nieletni `margin: 7mm 10mm` — bo formularz nieletniego
 *   niesie blok opiekuna i siedem punktów oświadczenia, i mieści się na jednej stronie tylko
 *   przy węższych marginesach. Liczba wpisana na sztywno była dobra dla jednego z nich i
 *   przesuwała cały drugi: pole zadruku miało inną szerokość, więc etykiety łamały się gdzie
 *   indziej, a początek układu współrzędnych leżał 4 mm wyżej, niż leży naprawdę.
 *
 *   Wartość stoi w pliku, więc się ją czyta. Zmiana marginesu w szablonie przenosi się wtedy
 *   do mapy sama, zamiast czekać, aż ktoś zauważy przesunięty formularz.
 */
function pageBox(template) {
  const rule = /@page\s*\{[^}]*margin:\s*([\d.]+)mm\s+([\d.]+)mm/.exec(template);
  if (!rule) throw new Error('nie znalazlem marginesow w @page — szablon zmienil ksztalt');
  const [, vertical, horizontal] = rule.map(Number);
  return {
    top: vertical, bottom: vertical, left: horizontal, right: horizontal,
    widthPx: Math.round((A4.w - horizontal * 2) * PX_PER_MM),
    heightPx: Math.round((A4.h - vertical * 2) * PX_PER_MM),
    originXPt: horizontal * PT_PER_MM,
    originYPt: (A4.h - vertical) * PT_PER_MM
  };
}

const MEASURE_PORT = 9422;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Ten sam układ, ale z PRZYKŁADOWYMI danymi w polach i z kluczem przy każdym z nich.
 *
 * Nie z kreskami do pisania, i to nie jest szczegół: kreska ma sztywne 44 mm i na formularzu
 * nieletniego zawija się do własnego wiersza, czyli leży gdzie indziej niż wpisana wartość.
 * Mierzyć trzeba to miejsce, w którym Chrome stawia TEKST — więc dokument pomiarowy jest
 * dokumentem wypełnionym, tym samym, który buduje `--sample`.
 *
 * Długość przykładu nie ma znaczenia dla wyniku: mierzona jest pozycja pierwszego wiersza
 * komórki, a ta nie zależy od tego, co w niej stoi. Wypełniacz i tak skraca stopień pisma tak,
 * żeby wartość została w jednym wierszu.
 */
function measurableHtml(template, wordsFor, locale, minor) {
  const sample = { ...EXAMPLE, GUARDIAN_RELATION: COPY[locale].rel.mother };
  if (minor) Object.assign(sample, { FULL_NAME: 'Sara Rossi', BIRTH_DATE: '04.03.2011' });
  const marked = { ...wordsFor };
  for (const key of DATA_KEYS) {
    marked[key] = `<span data-pdf-field="${key}">${sample[key]}</span>`;
  }
  return render(template, marked);
}

async function openChrome() {
  const child = spawn(chromePath(), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--remote-debugging-port=${MEASURE_PORT}`,
    `--user-data-dir=${join(tmpdir(), 'carruleddhi-measure-' + Date.now())}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${MEASURE_PORT}/json/version`)).json();
      return { child, wsUrl: info.webSocketDebuggerUrl };
    } catch { await wait(250); }
  }
  child.kill();
  throw new Error('Chrome nie otworzył portu do pomiaru');
}

function cdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: done, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else done(message.result);
  });
  const ready = new Promise((done) => socket.addEventListener('open', done));
  const send = (method, params = {}, sessionId) => new Promise((done, reject) => {
    id += 1;
    pending.set(id, { resolve: done, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { socket, ready, send };
}

/* MIERZONA JEST LINIA BAZOWA TEKSTU, NIE KRESKA DO PISANIA — i to jest różnica między
   formularzem dorosłego a formularzem nieletniego.
   ---------------------------------------------------------------------------
   Pierwsza wersja brała dolną krawędź kreski. Na formularzu dorosłego wychodziło to co do
   piksela, bo kreska leży tam w osobnym wierszu pod etykietą. Na formularzu nieletniego
   etykieta i kreska dzielą wiersz tabeli, a kreska ma sztywne 44 mm min-width — więc się
   ZAWIJA i ląduje o wiersz niżej, niż Chrome kładzie tam wpisaną wartość. Zmierzone:
   wszystkie pola nieletniego wychodziły 12 pt za nisko, a numer startowy 21 pt.

   Więc mierzy się dokument z PRZYKŁADOWYMI danymi — tam, gdzie Chrome naprawdę stawia tekst —
   a z pudełka tekstu odejmuje się zejście kroju, żeby dostać linię bazową. Zejście czyta się
   z `TextMetrics` tej samej czcionki, którą składa strona; wpisana na sztywno byłaby dobra dla
   Segoe UI i zła wszędzie, gdzie go nie ma. */
const COLLECT = `(() => {
  const out = {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  for (const el of document.querySelectorAll('[data-pdf-field]')) {
    const box = el.getBoundingClientRect();
    /* Komórka, nie sam napis: w niej musi się zmieścić wartość dowolnej długości.
       Przy numerze startowym rodzicem jest <b>, co jest dokładnie tym, czego chcemy. */
    const host = el.parentElement || el;
    const cell = host.getBoundingClientRect();
    const style = getComputedStyle(host);
    ctx.font = style.font || (style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily);
    const metrics = ctx.measureText(el.textContent || 'Hxg');
    const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || 0;
    out[el.dataset.pdfField] = {
      cellX: cell.left, cellW: cell.width,
      /* Gora i wysokosc komorki, nie tylko linia bazowa.
         ---------------------------------------------------------------------------
         Linia bazowa mowi, GDZIE POSTAWIC napis w polu, ktore jest linia do pisania — i do
         wszystkich pol formularza to wystarcza. Nie wystarcza do numeru startowego, bo on
         nie stoi na linii, tylko siedzi w ramce, a ramke da sie wysrodkowac dopiero wtedy,
         gdy sie wie, gdzie ma gore i dol. Patrz galaz dla numeru w worker/fill-form.js. */
      cellTop: cell.top, cellH: cell.height,
      baseline: box.bottom - descent,
      size: parseFloat(style.fontSize)
    };
  }
  return out;
})()`;

async function measureFields(documents) {
  const { child, wsUrl } = await openChrome();
  const bus = cdp(wsUrl);
  await bus.ready;
  const { targetId } = await bus.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await bus.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => bus.send(method, params, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setEmulatedMedia', { media: 'print' });

  const measured = {};
  for (const [name, html, box] of documents) {
    /* Okno wielkości pola zadruku TEGO szablonu. Ustawiane per dokument, bo oba szablony mają
       inne marginesy — przy jednym rozmiarze na oba etykiety w drugim łamią się inaczej niż
       przy druku i cała mapa jest o wiersz obok. */
    await call('Emulation.setDeviceMetricsOverride', {
      width: box.widthPx, height: box.heightPx, deviceScaleFactor: 1, mobile: false
    });
    const temp = join(tmpdir(), `carruleddhi-measure-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    writeFileSync(temp, html, 'utf8');
    try {
      await call('Page.navigate', { url: `file:///${temp.replace(/\\/g, '/')}` });
      await wait(700);
      const answer = await call('Runtime.evaluate', { expression: COLLECT, returnByValue: true });
      if (answer.exceptionDetails) throw new Error(JSON.stringify(answer.exceptionDetails));
      const boxes = answer.result.value;
      if (!Object.keys(boxes).length) throw new Error(`nie zmierzono ani jednego pola w ${name}`);

      measured[name] = Object.fromEntries(Object.entries(boxes).map(([key, field]) => [key, {
        x: round(box.originXPt + field.cellX * PT_PER_PX),
        y: round(box.originYPt - field.baseline * PT_PER_PX),
        width: round(field.cellW * PT_PER_PX),
        size: round(field.size * PT_PER_PX),
        /* Gorna krawedz komorki i jej wysokosc, w punktach PDF. Uzywa ich tylko numer
           startowy — jedyne pole, ktore jest ramka, a nie linia. */
        frameY: round(box.originYPt - field.cellTop * PT_PER_PX),
        frameH: round(field.cellH * PT_PER_PX)
      }]));
    } finally {
      rmSync(temp, { force: true });
    }
  }

  bus.socket.close();
  child.kill();
  return measured;
}

const round = (value) => Math.round(value * 100) / 100;

/* --------------------------------------------------------------------- build */

const chrome = chromePath();
const templates = {
  adult: readFileSync(join(ROOT, 'emails', 'pdf-print.html'), 'utf8'),
  minor: readFileSync(join(ROOT, 'emails', 'pdf-print-minor.html'), 'utf8')
};

mkdirSync(OUT_DIR, { recursive: true });

let built = 0;
/** Dokumenty do zmierzenia, pod nazwą pliku bez rozszerzenia — patrz measureFields(). */
const toMeasure = [];
for (const locale of LOCALES) {
  for (const kind of ['adult', 'minor']) {
    const minor = kind === 'minor';
    const values = { ...wording(locale, minor), ...data(locale, minor) };
    const stem = `${minor ? 'Carruleddhi-minori' : 'Carruleddhi-modulo'}-${locale}`;
    const outFile = join(OUT_DIR, `${stem}.pdf`);
    toPdf(chrome, render(templates[kind], values), outFile);
    /* Mierzony jest TEN SAM układ, który przed chwilą poszedł do druku — tylko z polami
       podpisanymi kluczami, żeby dało się je od siebie odróżnić. Przy `--sample` nie ma czego
       mierzyć: pola niosą wtedy przykładowe dane zamiast kresek, a mapa opisuje pusty
       formularz, bo to na nim wypełniacz rysuje. */
    if (!SAMPLE) toMeasure.push([stem, measurableHtml(templates[kind], wording(locale, minor), locale, minor), pageBox(templates[kind])]);
    built += 1;
    console.log(`  ${stem}.pdf  (${(statSync(outFile).size / 1024).toFixed(1)} kB)`);
  }
}

/* The names the deployed site and the older instructions already point at. */
copyFileSync(join(OUT_DIR, 'Carruleddhi-modulo-it.pdf'), join(OUT_DIR, 'Carruleddhi-modulo.pdf'));
copyFileSync(join(OUT_DIR, 'Carruleddhi-minori-it.pdf'), join(OUT_DIR, 'Carruleddhi-modulo-minori.pdf'));

/* ---------------------------------------------------------------------------
   Te same szablony, ale dla funkcji na Vercelu.

   PO CO
     Pliki PDF wyżej są puste i jeden służy wszystkim — inaczej każdy uczestnik
     dostawałby formularz z cudzym nazwiskiem, o czym mówi nagłówek tego pliku.
     Formularz z WŁASNYMI danymi musi więc powstawać przy każdym zgłoszeniu, a to
     znaczy: w funkcji, nie tutaj.

     Funkcja nie widzi `emails/pdf-print*.html` — ten katalog istnieje tylko na dysku
     autora. Szablony jadą do niej tą samą drogą, którą jadą szablony maili
     (tools/build-make-blueprints.mjs -> worker/email-templates.js).

   DLACZEGO SUROWE SZABLONY, A NIE DWANAŚCIE GOTOWYCH
     Kusi, żeby wstawić tu tłumaczenia i zapisać dwanaście wariantów (2 rodzaje × 6
     języków), żeby funkcja podstawiała już tylko dane. Kosztowałoby to ~144 kB
     w pakiecie funkcji zamiast ~40 kB — a przy okazji zamroziłoby datę: `%GENERATEDAT%`
     stałaby się datą budowania, a nie datą wydruku. Formularz z wczorajszą datą
     w stopce wygląda jak pomyłka dokładnie wtedy, gdy ktoś pokazuje go przy starcie.

     Zostają więc dwa surowe szablony i mapy słów osobno. `%GENERATEDAT%` zostaje
     nietknięte i rozwiązuje je funkcja w chwili otwarcia strony.
   --------------------------------------------------------------------------- */
const printWording = {};
for (const locale of LOCALES) {
  for (const kind of ['adult', 'minor']) {
    /* Trzeci argument to data w stopce. Podajemy sam placeholder zamiast dzisiejszej
       daty, bo tę stronę renderuje funkcja w chwili otwarcia — stopka ma nieść datę
       wydruku, nie datę, w której ktoś ostatnio uruchomił ten generator. */
    printWording[`${locale}:${kind}`] = wording(locale, kind === 'minor', '%GENERATEDAT%');
  }
}

writeFileSync(
  join(ROOT, 'worker', 'print-templates.js'),
  '/* GENERATED by tools/build-pdfs.mjs. Do not edit — change emails/pdf-print.html,\n'
    + '   emails/pdf-print-minor.html or emails/pdf-copy.json. */\n'
    + '/* eslint-disable */\n'
    + `export const PRINT_TEMPLATES = ${JSON.stringify(templates, null, 1)};\n\n`
    + '/* Klucz to "jezyk:rodzaj". %GENERATEDAT% zostaje nierozwiazane celowo — podstawia\n'
    + '   je funkcja w chwili otwarcia strony, zeby stopka nosila date wydruku. */\n'
    + `export const PRINT_WORDING = ${JSON.stringify(printWording, null, 1)};\n\n`
    + '/* Kazde pole osobowe w obu szablonach. Funkcja musi podac je wszystkie — render()\n'
    + '   rzuca na kazdym nierozwiazanym {{PLACEHOLDER}}. */\n'
    + `export const PRINT_DATA_KEYS = ${JSON.stringify(DATA_KEYS)};\n`,
  'utf8'
);

console.log(`\n${built} PDFs + 2 legacy names in public/emails/${SAMPLE ? '  (sample data)' : '  (blank forms)'}`);
/* ------------------------------------------------- mapa pol dla wypelniacza PDF */
if (!SAMPLE) {
  const fields = await measureFields(toMeasure);
  /* Dwie nazwy zgodnosciowe wskazuja na te same pliki co wersje wloskie, wiec dostaja te
     same wspolrzedne — inaczej wypelniacz trafilby na plik, o ktorym mapa nic nie wie. */
  fields['Carruleddhi-modulo'] = fields['Carruleddhi-modulo-it'];
  fields['Carruleddhi-modulo-minori'] = fields['Carruleddhi-minori-it'];

  writeFileSync(
    join(ROOT, 'worker', 'form-fields.js'),
    [
      '/* GENERATED by tools/build-pdfs.mjs. Do not edit.',
      '   Wspolrzedne kazdego pola na PUSTYM formularzu, w punktach PDF liczonych od lewego',
      '   dolnego rogu strony. Zmierzone w ukladzie DRUKU przez Chrome — patrz measureFields()',
      '   w generatorze. Uzywa ich worker/fill-form.js, zeby dopisac dane na gotowej stronie. */',
      '/* eslint-disable */',
      `export const FORM_FIELDS = ${JSON.stringify(fields, null, 1)};`,
      ''
    ].join('\n'),
    'utf8'
  );
  const inAdult = Object.keys(fields['Carruleddhi-modulo-it'] || {}).length;
  console.log(`worker/form-fields.js  (${Object.keys(fields).length} formularzy, ${inAdult} pol w doroslym)`);
}

console.log('worker/print-templates.js  (szablony i slowa dla funkcji)');
