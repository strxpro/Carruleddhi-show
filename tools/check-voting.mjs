/**
 * Maszyna stanu głosowania, sprawdzana bez sieci i bez bazy.
 *
 * PO CO OSOBNY PLIK
 *   `votingPhase` rozstrzyga, kto może oddać głos i kiedy. Pomyłka w kolejności warunków nie
 *   wywali się na żadnym ekranie — objawi się głosowaniem, które nie otworzyło się o godzinie
 *   zero albo nie dało się zamknąć, w jedynym dniu w roku, w którym to ma znaczenie. Sprawdzić
 *   to da się tylko przestawiając zegar, a tego nie zrobi żadna sonda w przeglądarce.
 *
 * DLACZEGO FUNKCJE SĄ WYCIĄGANE Z ŹRÓDŁA
 *   worker/index.js jest modułem Workera i nie zaimportuje się w Node — ma `export default`
 *   z `fetch(request, env, ctx)` i sięga po bindingi. Kopia tych funkcji tutaj byłaby drugą
 *   implementacją, która przestanie odpowiadać pierwszej przy najbliższej poprawce, więc
 *   testowany jest tekst z pliku: co jest w Workerze, to jest sprawdzane.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const worker = read('worker/index.js');

const results = [];
const check = (label, pass, extra = '') => results.push({ label, pass, extra });

/**
 * Deklaracja wyjęta ze źródła, licząc klamry.
 *
 * Nie wyrażeniem regularnym do pierwszej klamry w pierwszej kolumnie: te funkcje mają w
 * środku zagnieżdżone strzałki i obiekty, więc pierwsza taka klamra nie jest ich końcem.
 */
function extract(signature) {
  const start = worker.indexOf(signature);
  if (start < 0) throw new Error(`nie znalazlem ${signature}`);
  let depth = 0;
  for (let i = worker.indexOf('{', start); i < worker.length; i += 1) {
    if (worker[i] === '{') depth += 1;
    else if (worker[i] === '}') {
      depth -= 1;
      if (!depth) return worker.slice(start, i + 1);
    }
  }
  throw new Error(`nie znalazlem konca ${signature}`);
}

const { votingPhase, votingWindow } = new Function(`
  ${extract('const stamp =')}
  ${extract('function votingPhase')}
  ${extract('function votingWindow')}
  return { votingPhase, votingWindow };
`)();

/* --- fazy według zegara -------------------------------------------------- */

const T = (iso) => Date.parse(iso);
const NOON = T('2026-10-17T12:00:00Z');
const race = '2026-10-17T12:30:00Z';
const ends = '2026-10-17T13:00:00Z';

const scheduled = { status: 'scheduled', race_starts_at: race, voting_ends_at: ends, duration_minutes: 30 };

check('bez wiersza ustawien: odliczanie, nie glosowanie', votingPhase(null) === 'scheduled');
check('bez terminu startu: odliczanie, nie glosowanie',
  votingPhase({ status: 'scheduled', race_starts_at: null, voting_ends_at: null }) === 'scheduled');
check('pol godziny przed startem: odliczanie', votingPhase(scheduled, NOON) === 'scheduled');
check('sekunde przed startem: jeszcze odliczanie', votingPhase(scheduled, T(race) - 1000) === 'scheduled');
check('dokladnie o godzinie zero: glosowanie', votingPhase(scheduled, T(race)) === 'voting');
check('w trakcie okna: glosowanie', votingPhase(scheduled, T(race) + 60000) === 'voting');
check('sekunde przed koncem: jeszcze glosowanie', votingPhase(scheduled, T(ends) - 1000) === 'voting');
check('dokladnie o koncu okna: zamkniete', votingPhase(scheduled, T(ends)) === 'closed');
check('dlugo po koncu: zamkniete', votingPhase(scheduled, T(ends) + 86400000) === 'closed');

/* Ręczne zamknięcie musi wygrywać z zegarem — to jest jedyna rzecz, jaką znaczy ta kolumna. */
check('reczne zamkniecie wygrywa w srodku okna',
  votingPhase({ ...scheduled, status: 'closed' }, T(race) + 60000) === 'closed');
check('reczne zamkniecie wygrywa takze przed startem',
  votingPhase({ ...scheduled, status: 'closed' }, NOON) === 'closed');

/* Status 'voting' nie może otworzyć głosowania sam z siebie: gdyby mógł, ustawiony ręcznie i
   zapomniany trzymałby głosowanie otwarte po terminie. Zegar zamyka. */
check('status voting nie przezywa konca okna',
  votingPhase({ ...scheduled, status: 'voting' }, T(ends) + 1000) === 'closed');
check('status voting nie otwiera przed startem',
  votingPhase({ ...scheduled, status: 'voting' }, NOON) === 'scheduled');

/* Niedokończona konfiguracja nie może wpuścić nikogo. Termin bez końca okna to stan, w którym
   nie wiadomo, kiedy zamknąć — i lepiej głosować bez limitu niż nie zacząć, ale organizator
   musi to zobaczyć w panelu, dlatego faza jest jawna. */
check('termin bez konca okna: glosowanie po starcie',
  votingPhase({ status: 'scheduled', race_starts_at: race, voting_ends_at: null }, T(race) + 1000) === 'voting');

check('smieci w dacie nie otwieraja glosowania',
  votingPhase({ status: 'scheduled', race_starts_at: 'kiedys', voting_ends_at: null }, NOON) === 'scheduled');

/* --- okno liczone z terminu i czasu trwania ------------------------------ */

const w = votingWindow(race, 45);
check('koniec okna = start + czas trwania', w.endsAt === '2026-10-17T13:15:00.000Z', w.endsAt);
check('start okna znormalizowany do ISO', w.startsAt === '2026-10-17T12:30:00.000Z', w.startsAt);
check('bez terminu nie ma okna', votingWindow(null, 30).endsAt === null);
check('czas trwania ponizej minuty podciagany do domyslnego',
  votingWindow(race, 0).endsAt === '2026-10-17T13:00:00.000Z', votingWindow(race, 0).endsAt);
check('czas trwania powyzej doby przycinany do doby',
  votingWindow(race, 99999).endsAt === '2026-10-18T12:30:00.000Z', votingWindow(race, 99999).endsAt);
check('smieci w czasie trwania daja domyslne 30 minut',
  votingWindow(race, 'duzo').endsAt === '2026-10-17T13:00:00.000Z');

/* --- podlaczenie w Workerze --------------------------------------------- */

check('trasa voting prowadzi do handlera', worker.includes("if (type === 'voting') return voting(env, payload, cors)"));
check('trasa voting-admin prowadzi do handlera',
  worker.includes("if (type === 'voting-admin') return votingAdmin(env, payload, cors)"));
check('voting-admin jest za passphrase', /PROTECTED_TYPES[\s\S]{0,400}'voting-admin'/.test(worker));
check('voting-admin ma podniesiony limit ciala, bo niesie zdjecie',
  /carriesImage[\s\S]{0,200}voting-admin/.test(worker));
check('zdjecia uczestnikow trafiaja do prywatnego bucketa',
  worker.includes("uploadPhoto(env, photo, 'participants', 'participant-photos')"));

/* Żeton do zmiany głosu jest zdolnością i nie wolno mu wrócić do przeglądarki.
   Sprawdzane po ciele każdej odpowiedzi osobno, a nie wyrażeniem po całym handlerze: takie
   wyrażenie przeskakuje przez pierwszy `return` aż do `const editToken` i zapala się zawsze,
   czyli nie sprawdza niczego. */
const voteHandler = extract('async function votingVote');
const responseBodies = (source) => source
  .split('return json(')
  .slice(1)
  .map((fragment) => fragment.slice(0, fragment.indexOf(', cors)')));
const leaks = responseBodies(voteHandler).filter((body) => /edit_?[Tt]oken/.test(body));
check('zeton edycji nie wraca w zadnej odpowiedzi na glos', leaks.length === 0, leaks.join(' | '));
check('zeton edycji wychodzi mailem', voteHandler.includes('editUrl'));
check('odsylacz do zmiany glosu jest we fragmencie, nie w zapytaniu',
  /#vote=\$\{editToken\}/.test(worker) && !/[?&]vote=\$\{editToken\}/.test(worker),
  'fragment nie idzie do logow serwera ani w Referer');
/* Okno oceny stoi od migracji 0025 na podstronie, wiec odsylacz w mailu musi tam prowadzic.
   Adres wskazujacy korzen otwieralby strone, na ktorej nie ma czym obsluzyc zetonu. */
check('odsylacz do zmiany glosu prowadzi na podstrone glosowania',
  worker.includes('votazione.html#vote=${editToken}'));

/* --- nagroda publicznosci ------------------------------------------------ */

/* Kategoria glosu jest STALA po stronie serwera, nie polem z zadania. To jest wlasnosc
   bezpieczenstwa: gdyby przychodzila z zadania, limit „jeden glos" dalby sie obejsc wysylajac
   za kazdym razem inny napis — indeks unikalny pilnuje pary (adres, kategoria), a kategoria do
   wymyslenia nie jest zadnym limitem. Migracja 0025 na krotko to poswiecila, 0026 przywraca. */
check('jest dokladnie jedna kategoria glosowania publicznego',
  /const PUBLIC_AWARD = 'public-choice';/.test(worker) && !/VOTE_AWARDS/.test(worker));
check('kategoria glosu nie pochodzi z zadania',
  voteHandler.includes('category: PUBLIC_AWARD')
  && !/category:\s*(payload|award)/.test(voteHandler));
check('nagroda nie jest juz polem w zadaniu',
  !/'award'/.test(/voting: \[[^\]]*\]/.exec(worker)?.[0] || ''));
check('ocena poza zakresem jest odrzucana, nie przycinana',
  voteHandler.includes('VOTING_BAD_SCORE') && !/clamp|Math\.min/.test(voteHandler));
check('duplikat glosu rozpoznany po bazie, nie po zapytaniu wczesniej',
  voteHandler.includes('stored.duplicate') && voteHandler.includes('VOTING_ALREADY_VOTED'));

const stateHandler = extract('async function votingState');
check('srednie nie wychodza publicznie w trakcie glosowania',
  stateHandler.includes('closed ? await readRanking(env) : []'));
check('oddany glos wraca tylko dla nagrody publicznosci',
  stateHandler.includes("row.category === PUBLIC_AWARD"));
check('nie ma juz drugiego widoku agregatow',
  !/readTotals|voting_totals/.test(worker));

const winners = extract('async function votingAdminWinners');
check('listy do zwyciezcow tylko po zamknieciu', winners.includes('VOTING_STILL_OPEN'));
check('zwyciezca bez zgloszenia trafia na liste nieosiagalnych', winners.includes('unreachable'));
check('zwyciezcy licza sie z rankingu nagrody publicznosci',
  winners.includes('readRanking(env)'));

/* --- migracja pod jedna nagrode ------------------------------------------ */

const award = read('supabase/migrations/0026_public_award.sql');
/* Widok MUSI odsiewac glosy z innej kategorii. Bez warunku do rankingu weszlyby wiersze z
   `classic`, `art` i `prize-N`, czyli glosy z prob sprzed tej migracji — i zrobilyby to bez
   zadnego bledu, tylko z zawyzonym wynikiem. */
check('widok rankingu odsiewa glosy z innej kategorii',
  /and v\.category = 'public-choice'/.test(award));
check('drugi widok agregatow jest zdejmowany',
  /drop view if exists public\.voting_totals/.test(award));
check('migracja jest powtarzalna', (award.match(/drop view if exists/g) || []).length >= 2
  && /create index if not exists/.test(award));
check('migracja nie kasuje glosow',
  !/^\s*delete from/m.test(award.replace(/\/\*[\s\S]*?\*\//g, '')));

/* --- wynik --------------------------------------------------------------- */

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? `  -> ${extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
