/**
 * Migracje SQL sprawdzane bez bazy danych.
 *
 * PO CO TO ISTNIEJE
 *   Migracje 0029 i 0030 są jedynymi plikami w tym projekcie, których nie da się uruchomić na
 *   tej maszynie: nie ma tu ani Supabase CLI, ani Dockera, ani psql. Jednocześnie 0030 zawiera
 *   funkcję, która USUWA wszystkie głosy i wszystkich uczestników — czyli dokładnie ten rodzaj
 *   kodu, który nie ma prawa pojechać na produkcję „chyba dobrze napisany".
 *
 *   Ten checker nie zastępuje Postgresa i nie udaje, że to robi. Łapie klasę błędów, którą da
 *   się złapać z tekstu: niedomknięte cytowanie dolarowe, niezbilansowane begin/end, kolumny
 *   wymyślone zamiast odczytane z wcześniejszych migracji, brak idempotencji i — najważniejsze
 *   — DELETE stojący przed snapshotem albo przed warunkami bezpieczeństwa.
 *
 * CZEGO TEN PLIK NIE SPRAWDZA
 *   Składni PL/pgSQL w sensie parsera, planów zapytań i zachowania przy współbieżności. To
 *   wymaga bazy i musi być zrobione przez `supabase db reset` przed wdrożeniem.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'supabase/migrations');
const read = (name) => readFileSync(resolve(dir, name), 'utf8');

const results = [];
const check = (label, pass, extra = '') => results.push({ label, pass, extra });

/** Komentarze wycięte, żeby zdanie w komentarzu nie liczyło się jako kod. */
const code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
const announcements = read('0029_event_announcements.sql');
const editions = read('0030_voting_editions.sql');
const editionsCode = code(editions);
const sponsorPurpose = read('0032_sponsor_code_purpose.sql');
const sponsorPurposeCode = code(sponsorPurpose);
const prizeWinners = read('0034_prize_winners.sql');
const prizeWinnersCode = code(prizeWinners);

/* --- kolumny, na których stoją nowe migracje ----------------------------- */

/* Wszystkie migracje razem: nowa nie może opierać się na kolumnie, której nikt nie tworzy.
   To jest ten błąd, który na produkcji objawia się jako 400 z PostgREST w dniu zawodów. */
const everything = files.map((name) => code(read(name))).join('\n');

for (const column of [
  'duration_minutes', 'race_starts_at', 'voting_started_at', 'voting_ends_at',
  'participant_id', 'device_id', 'edit_token', 'image_path', 'registration_id', 'start_number',
  /* Kolumny, na których stoi werdykt nagród i ogłoszenie dla drugiej listy (0034). Worker
     czyta je po nazwie, więc literówka tutaj to 400 z PostgREST w dniu zawodów. */
  'prize_key', 'winner_label', 'prizes', 'last_announcement_event'
]) {
  check(`kolumna ${column} jest gdzies utworzona`, everything.includes(column));
}

/* --- 0029: idempotencja -------------------------------------------------- */

check('0029 dodaje kolumne warunkowo',
  /add column if not exists last_announcement_event/i.test(announcements));
check('0029 tworzy indeks warunkowo',
  /create index if not exists/i.test(announcements));
check('0029 nie kasuje zadnych wierszy',
  !/\bdelete\s+from\b|\btruncate\b/i.test(code(announcements)));

/* --- 0030: cytowanie i bloki -------------------------------------------- */

/* Cytowanie dolarowe musi się domykać parami. Nieparzysta liczba `$$` znaczy, że resztę pliku
   Postgres czyta jako treść funkcji — i wywala się dopiero na końcu, komunikatem o niczym. */
const dollars = (editions.match(/\$\$/g) || []).length;
check('0030 ma domkniete cytowanie dolarowe ($$ parami)', dollars > 0 && dollars % 2 === 0,
  `znalezione: ${dollars}`);

/* `begin` w PL/pgSQL i `end;` muszą się zbilansować. Liczone na słowach z granicami, żeby
   `begin` w środku identyfikatora nie zaburzył rachunku. */
const begins = (editionsCode.match(/\bbegin\b/gi) || []).length;
const ends = (editionsCode.match(/\bend\s*;/gi) || []).length;
check('0030 ma zbilansowane begin/end', begins === ends, `begin=${begins} end=${ends}`);

check('0030 deklaruje funkcje jako plpgsql', /language\s+plpgsql/i.test(editionsCode));
check('0030 ustawia search_path w funkcji', /set\s+search_path\s*=\s*public/i.test(editionsCode));
check('0030 jest security definer', /security\s+definer/i.test(editionsCode));

/* --- 0030: idempotencja ------------------------------------------------- */

check('0030 tworzy tabele warunkowo',
  (editionsCode.match(/create table if not exists/gi) || []).length >= 2);
check('0030 tworzy indeksy warunkowo',
  (editionsCode.match(/create index if not exists|create unique index if not exists/gi) || []).length >= 3);
check('0030 dodaje kolumny warunkowo',
  (editionsCode.match(/add column if not exists/gi) || []).length >= 4);
check('0030 uzywa create or replace dla funkcji',
  /create or replace function public\.rollover_voting_edition/i.test(editionsCode));

/* KAŻDY dodawany constraint musi mieć wcześniej `drop constraint if exists` z tą samą nazwą.
   Bez tego drugi przebieg migracji kończy się `duplicate_object` — a migracja, której nie da
   się puścić dwa razy, jest migracją, której nie da się naprawić po nieudanym pierwszym razie. */
const added = [...editionsCode.matchAll(/add constraint (\w+)/gi)].map((match) => match[1]);
check('0030 dodaje przynajmniej jeden constraint', added.length > 0);
for (const name of added) {
  const dropped = new RegExp(`drop constraint if exists ${name}\\b`, 'i').test(editionsCode);
  check(`0030 zdejmuje ${name} przed dodaniem`, dropped);
}

/* --- 0030: bezpieczeństwo rolloveru ------------------------------------- */

const fn = editionsCode.slice(editionsCode.indexOf('rollover_voting_edition'));
const at = (needle) => fn.search(needle);

const snapshot = at(/into\s+archived_results/i);
const archive = at(/update public\.voting_editions set/i);
const optIns = at(/insert into public\.voting_result_notifications/i);
const deleteVotes = at(/delete from public\.votes/i);
const deleteParticipants = at(/delete from public\.participants/i);

check('0030 w ogole kasuje glosy w rolloverze (inaczej reszta testow nic nie znaczy)',
  deleteVotes > 0 && deleteParticipants > 0);
check('0030 robi snapshot PRZED usunieciem glosow', snapshot > 0 && snapshot < deleteVotes);
check('0030 archiwizuje edycje PRZED usunieciem glosow', archive > 0 && archive < deleteVotes);
check('0030 przepisuje zgody na wynik PRZED usunieciem glosow',
  optIns > 0 && optIns < deleteVotes);

/* Warunki, które mają zatrzymać rollover, muszą stać przed DELETE — warunek po nim jest
   sprawdzaniem, czy wolno było zrobić to, co już się stało. */
for (const [label, needle] of [
  ['odmawia przy otwartym glosowaniu', /VOTING_EDITION_NOT_CLOSED/],
  ['odmawia przy braku aktywnej edycji z danymi', /ACTIVE_EDITION_MISSING/],
  ['odmawia przy duplikacie rocznika', /EDITION_ALREADY_EXISTS/],
  ['odmawia przy niepelnych danych wejsciowych', /INVALID_EDITION/]
]) {
  const where = at(needle);
  check(`0030 ${label}`, where > 0 && where < deleteVotes);
}

check('0030 bierze blokade transakcyjna przed czymkolwiek',
  at(/pg_advisory_xact_lock/) > 0 && at(/pg_advisory_xact_lock/) < snapshot);

/* Zdjęcia zostają w Storage. Snapshot niesie `imagePath`, więc archiwum ma czym pokazać
   zwycięzców z poprzednich lat — usunięcie plików zamieniłoby je w puste kafelki. */
check('0030 zachowuje sciezki zdjec w snapshocie', /'imagePath'/.test(editionsCode));
check('0030 nie rusza bucketa ze zdjeciami', !/storage\./i.test(editionsCode));

/* --- 0030: prywatność archiwum ----------------------------------------- */

/* Publiczny snapshot to agregaty. Adres, imię głosującego ani żeton edycji nie mają prawa
   znaleźć się w `voting_editions.results` — to jest tabela, z której czyta strona. */
const snapshotBlock = editionsCode.slice(snapshot >= 0 ? snapshot : 0, deleteVotes);
for (const leak of ['voter_email', 'voter_name', 'edit_token', 'device_id']) {
  check(`0030 nie wpisuje ${leak} do publicznego snapshotu`, !snapshotBlock.includes(leak));
}
check('0030 trzyma zgody na wynik w osobnej, prywatnej tabeli',
  /create table if not exists public\.voting_result_notifications/i.test(editionsCode));
check('0030 odbiera anonimowym dostep do edycji',
  /revoke all on public\.voting_editions from anon/i.test(editionsCode));
check('0030 odbiera anonimowym dostep do kolejki powiadomien',
  /revoke all on public\.voting_result_notifications from anon/i.test(editionsCode));
check('0030 wlacza RLS na obu nowych tabelach',
  (editionsCode.match(/enable row level security/gi) || []).length >= 2);
check('0030 nie pozwala anonimowym wolac rolloveru',
  /revoke execute on function public\.rollover_voting_edition[\s\S]{0,120}from public, anon, authenticated/i
    .test(editionsCode));

/* --- 0030: jedna zmiana glosu ------------------------------------------ */

check('0030 dodaje licznik zmian glosu', /add column if not exists edit_count/i.test(editionsCode));
check('0030 ogranicza licznik zmian do jednej',
  /edit_count between 0 and 1/i.test(editionsCode));
check('0030 dopuszcza glos bez imienia i adresu',
  /alter column voter_name drop not null/i.test(editionsCode)
  && /alter column voter_email drop not null/i.test(editionsCode));
check('0030 unikalnosc adresu tylko dla podanych adresow',
  /votes_email_category_key[\s\S]{0,160}where voter_email is not null/i.test(editionsCode));

/* --- 0032: nowy cel kodu weryfikacyjnego -------------------------------- */

/* `check` nie da się zmienić w miejscu, więc migracja musi go zdjąć i założyć ponownie.
   Odwrotna kolejność to `duplicate_object` na starym ograniczeniu — czyli migracja, która
   nie przechodzi ani pierwszy raz, ani żaden następny. */
const purposeDrop = sponsorPurposeCode.search(/drop constraint\s+verification_codes_purpose_check/i);
const purposeAdd = sponsorPurposeCode.search(/add constraint\s+verification_codes_purpose_check/i);
check('0032 zdejmuje ograniczenie purpose', purposeDrop >= 0);
check('0032 zaklada ograniczenie purpose ponownie', purposeAdd >= 0);
check('0032 zdejmuje ograniczenie PRZED zalozeniem nowego',
  purposeDrop >= 0 && purposeAdd >= 0 && purposeDrop < purposeAdd,
  `drop=${purposeDrop} add=${purposeAdd}`);

/* Nazwa ograniczenia musi być potwierdzona w katalogu, a nie wpisana z pamięci: na cudzej
   instalacji Postgres mógł nadać inną i `drop constraint` wywala całą migrację. Tak samo
   robią 0016 i 0018. */
const purposeLookup = sponsorPurposeCode.search(/from\s+pg_constraint/i);
check('0032 szuka nazwy ograniczenia w pg_constraint', purposeLookup >= 0);
check('0032 zaweza wyszukanie do verification_codes',
  /conrelid\s*=\s*'public\.verification_codes'::regclass/i.test(sponsorPurposeCode));
check('0032 sprawdza katalog PRZED zdjeciem ograniczenia',
  purposeLookup >= 0 && purposeDrop >= 0 && purposeLookup < purposeDrop,
  `lookup=${purposeLookup} drop=${purposeDrop}`);

/* Komplet wartości w nowym `CHECK`. Brak którejkolwiek to odrzucony zapis kodu dopiero na
   produkcji — objaw widoczny jako odmowa na końcu przepływu, po tym jak gość przeszedł całą
   drogę. Nadmiar znaczy, że lista rozjechała się z tym, co obsługuje Worker. */
const purposeCheck = sponsorPurposeCode
  .slice(purposeAdd >= 0 ? purposeAdd : 0)
  .match(/check\s*\(\s*purpose\s+in\s*\(([^)]*)\)/i);
const purposeValues = purposeCheck
  ? [...purposeCheck[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];
check('0032 ogranicza purpose lista wartosci', purposeValues.length > 0);
for (const value of ['unsubscribe', 'manage-entry', 'edit-entry', 'cancel-entry', 'sponsor']) {
  check(`0032 dopuszcza cel ${value}`, purposeValues.includes(value));
}
check('0032 nie dopuszcza celow poza tymi pieciu', purposeValues.length === 5,
  `znalezione: ${purposeValues.join(', ') || 'brak'}`);

/* --- 0034: cytowanie i bloki -------------------------------------------- */

/* Ta migracja podmienia funkcję, która USUWA wszystkich uczestników i wszystkie głosy, więc
   jest sprawdzana tak samo dokładnie jak 0030 — i z tego samego powodu. */
const prizeDollars = (prizeWinners.match(/\$\$/g) || []).length;
check('0034 ma domkniete cytowanie dolarowe ($$ parami)',
  prizeDollars > 0 && prizeDollars % 2 === 0, `znalezione: ${prizeDollars}`);

const prizeBegins = (prizeWinnersCode.match(/\bbegin\b/gi) || []).length;
const prizeEnds = (prizeWinnersCode.match(/\bend\s*;/gi) || []).length;
check('0034 ma zbilansowane begin/end', prizeBegins === prizeEnds,
  `begin=${prizeBegins} end=${prizeEnds}`);

check('0034 deklaruje funkcje jako plpgsql', /language\s+plpgsql/i.test(prizeWinnersCode));
check('0034 ustawia search_path w funkcji',
  /set\s+search_path\s*=\s*public/i.test(prizeWinnersCode));
check('0034 jest security definer', /security\s+definer/i.test(prizeWinnersCode));

/* --- 0034: idempotencja ------------------------------------------------- */

check('0034 tworzy tabele warunkowo',
  /create table if not exists public\.prize_winners/i.test(prizeWinnersCode));
check('0034 tworzy indeksy warunkowo',
  /create index if not exists/i.test(prizeWinnersCode));
check('0034 dodaje kolumny warunkowo',
  (prizeWinnersCode.match(/add column if not exists/gi) || []).length >= 2);
check('0034 mrozi werdykt w kolumnie edycji',
  /add column if not exists prizes jsonb not null default/i.test(prizeWinnersCode));
check('0034 dodaje znacznik ogloszenia dla listy przypomnien',
  /alter table public\.reminder_subscribers[\s\S]{0,120}add column if not exists last_announcement_event/i
    .test(prizeWinnersCode));
check('0034 uzywa create or replace dla funkcji',
  /create or replace function public\.rollover_voting_edition/i.test(prizeWinnersCode));

/* KAŻDA nazwa więzu musi być WYSZUKANA w `pg_constraint`, a nie wpisana z pamięci: na cudzej
   instalacji Postgres mógł nadać inną, a wtedy `drop constraint` wywala całą migrację. Tak
   samo robią 0016, 0018 i 0032. Sprawdzane po nazwie i po pozycji: wyszukanie musi stać
   PRZED `add constraint`, bo inaczej niczego nie strzeże. */
const prizeAdded = [...prizeWinnersCode.matchAll(/add constraint (\w+)/gi)]
  .map((match) => ({ name: match[1], at: match.index ?? -1 }));
check('0034 dodaje przynajmniej trzy wiezy', prizeAdded.length >= 3,
  `znalezione: ${prizeAdded.map((entry) => entry.name).join(', ') || 'brak'}`);
for (const { name, at } of prizeAdded) {
  const lookup = prizeWinnersCode.search(
    new RegExp(`from pg_constraint[\\s\\S]{0,200}conname = '${name}'`, 'i')
  );
  check(`0034 szuka nazwy ${name} w pg_constraint przed dodaniem`, lookup >= 0 && lookup < at,
    `lookup=${lookup} add=${at}`);
}
/* Więzy zdejmowane (CHECK nie da się zmienić w miejscu) muszą lecieć PRZED ponownym
   założeniem — odwrotna kolejność to `duplicate_object` przy pierwszym i każdym przebiegu. */
for (const name of ['prize_winners_prize_key_check', 'voting_editions_prizes_array_check']) {
  const drop = prizeWinnersCode.search(new RegExp(`drop constraint ${name}\\b`, 'i'));
  const add = prizeWinnersCode.search(new RegExp(`add constraint ${name}\\b`, 'i'));
  check(`0034 zdejmuje ${name} przed zalozeniem od nowa`, drop >= 0 && add >= 0 && drop < add,
    `drop=${drop} add=${add}`);
}
check('0034 zaweza wyszukanie wiezow do wlasnych tabel',
  /conrelid\s*=\s*'public\.prize_winners'::regclass/i.test(prizeWinnersCode)
  && /conrelid\s*=\s*'public\.voting_editions'::regclass/i.test(prizeWinnersCode));

/* --- 0034: dwanascie nagrod i ani jednej wiecej -------------------------- */

const prizeCheck = prizeWinnersCode
  .slice(prizeWinnersCode.search(/add constraint prize_winners_prize_key_check/i))
  .match(/check\s*\(\s*prize_key\s+in\s*\(([^)]*)\)/i);
const prizeValues = prizeCheck
  ? [...prizeCheck[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];
check('0034 ogranicza prize_key lista wartosci', prizeValues.length > 0);
for (let index = 1; index <= 12; index += 1) {
  check(`0034 dopuszcza nagrode prize-${index}`, prizeValues.includes(`prize-${index}`));
}
/* Nagroda Publiczności WYNIKA z głosów (widok `voting_ranking`, migawka `results`). Wpisana
   tutaj miałaby dwa źródła, czyli dwa różne podia i pytanie, na które nikt nie odpowie. */
check('0034 nie dopuszcza nagrody publicznosci jako werdyktu jury',
  !prizeValues.includes('public-choice'));
check('0034 nie dopuszcza kluczy poza dwunastoma', prizeValues.length === 12,
  `znalezione: ${prizeValues.length}`);

/* --- 0034: ksztalt tabeli ----------------------------------------------- */

check('0034 wiaze werdykt z rocznikiem kaskadowo',
  /edition_id uuid not null references public\.voting_editions\(id\) on delete cascade/i
    .test(prizeWinnersCode));
/* `cascade` skasowałby werdykt razem z uczestnikami przy rolloverze, `restrict` zablokowałby
   rollover na zawsze. `set null` gubi tylko podpowiedź, a werdykt zostaje. */
check('0034 zeruje wskazanie na uczestnika, a nie kasuje werdyktu',
  /foreign key \(participant_id\) references public\.participants\(id\) on delete set null/i
    .test(prizeWinnersCode));
check('0034 dopuszcza zwyciezce poza lista startowa',
  /winner_label text/i.test(prizeWinnersCode)
  && !/participant_id uuid not null/i.test(prizeWinnersCode));
check('0034 pilnuje jednego zwyciezcy na nagrode w roczniku',
  /add constraint prize_winners_edition_prize_key unique \(edition_id, prize_key\)/i
    .test(prizeWinnersCode));
check('0034 wlacza RLS na tabeli nagrod',
  /alter table public\.prize_winners enable row level security/i.test(prizeWinnersCode));
check('0034 odbiera anonimowym dostep do nagrod',
  /revoke all on public\.prize_winners from anon, authenticated/i.test(prizeWinnersCode));
check('0034 nie pozwala anonimowym wolac rolloveru',
  /revoke execute on function public\.rollover_voting_edition[\s\S]{0,120}from public, anon, authenticated/i
    .test(prizeWinnersCode));

/* Predykat indeksu częściowego MUSI być IMMUTABLE. `now()` w `where` to błąd 42P17, a gdyby
   przeszedł, byłby kłamliwy: Postgres liczy predykat raz, przy zakładaniu. Patrz 0033. */
const reminderIndex = prizeWinnersCode.match(/create index if not exists[\s\S]{0,200}?;/i)?.[0] || '';
check('0034 nie wola funkcji w predykacie indeksu', !/now\s*\(/i.test(reminderIndex),
  reminderIndex.replace(/\s+/g, ' ').slice(0, 120));
check('0034 indeksuje tylko aktywnych', /where status = 'active'/i.test(reminderIndex));

/* --- 0034: bezpieczenstwo rolloveru ------------------------------------- */

const roll = prizeWinnersCode.slice(
  prizeWinnersCode.indexOf('create or replace function public.rollover_voting_edition')
);
const rollAt = (needle) => roll.search(needle);

const prizeSnapshot = rollAt(/into\s+archived_prizes/i);
const resultSnapshot = rollAt(/into\s+archived_results/i);
const prizeFreeze = rollAt(/prizes = archived_prizes/i);
const dropVotes = rollAt(/delete from public\.votes/i);
const dropParticipants = rollAt(/delete from public\.participants/i);

check('0034 w ogole kasuje glosy w rolloverze (inaczej reszta testow nic nie znaczy)',
  dropVotes > 0 && dropParticipants > 0);
check('0034 robi migawke rankingu PRZED usunieciem glosow',
  resultSnapshot > 0 && resultSnapshot < dropVotes);
/* Bez tego werdykt nagród ginie razem z uczestnikami: numer startowy i nazwisko zwycięzcy z
   listy startowej żyją w `participants`, a nie w `prize_winners`. */
check('0034 robi migawke nagrod PRZED usunieciem uczestnikow',
  prizeSnapshot > 0 && prizeSnapshot < dropParticipants);
check('0034 wpisuje migawke nagrod do archiwizowanego rocznika',
  prizeFreeze > 0 && prizeFreeze < dropParticipants);
check('0034 czyta werdykt z tabeli, nie z niczego',
  /from public\.prize_winners/i.test(roll));
/* Sortowanie tekstowe ustawia prize-10 przed prize-2. Numeracja nagród jest liczbowa. */
check('0034 porzadkuje nagrody liczbowo, nie tekstowo',
  /regexp_replace\(w\.prize_key/i.test(roll) && /order by prize_order/i.test(roll));
check('0034 nie kasuje werdyktu ani jednym DELETE',
  !/delete from public\.prize_winners/i.test(prizeWinnersCode));

for (const [label, needle] of [
  ['odmawia przy otwartym glosowaniu', /VOTING_EDITION_NOT_CLOSED/],
  ['odmawia przy braku aktywnej edycji z danymi', /ACTIVE_EDITION_MISSING/],
  ['odmawia przy duplikacie rocznika', /EDITION_ALREADY_EXISTS/],
  ['odmawia przy niepelnych danych wejsciowych', /INVALID_EDITION/]
]) {
  const where = rollAt(needle);
  check(`0034 ${label}`, where > 0 && where < dropVotes);
}
check('0034 bierze blokade transakcyjna przed czymkolwiek',
  rollAt(/pg_advisory_xact_lock/) > 0 && rollAt(/pg_advisory_xact_lock/) < resultSnapshot);
check('0034 nie wpisuje glosujacych do publicznej migawki nagrod',
  !/voter_email|voter_name/i.test(roll.slice(prizeSnapshot, prizeFreeze > 0 ? prizeFreeze : dropVotes)));

/* --- 0034: harmonogram wraca po ogloszeniu ------------------------------ */

/* Gałąź „ta sama edycja". Stary warunek `votes_total = 0 and status <> 'closed'` zostawiał
   `voting_settings.status = 'closed'` po zakończonym sezonie — a `votingPhase()` sprawdza
   `closed` PIERWSZE, więc strona zostawała zamknięta z wygaszonymi przyciskami mimo nowego
   terminu. Ogłoszenie terminu ZAWSZE wraca do `scheduled`. */
const sameEditionStart = roll.search(/edition_key = next_key then/i);
const sameEditionEnd = roll.search(/'alreadyApplied', true/i);
const sameEdition = sameEditionStart >= 0 && sameEditionEnd > sameEditionStart
  ? roll.slice(sameEditionStart, sameEditionEnd)
  : '';
check('0034 ma galez "ta sama edycja"', sameEdition.length > 0,
  `start=${sameEditionStart} end=${sameEditionEnd}`);
check('0034 przestawia harmonogram na scheduled takze w tej samej edycji',
  /status = 'scheduled'/i.test(sameEdition) && /race_starts_at = excluded\.race_starts_at/i.test(sameEdition));
check('0034 nie warunkuje powrotu harmonogramu liczba glosow',
  !/votes_total\s*=\s*0/i.test(sameEdition));
check('0034 nie warunkuje powrotu harmonogramu poprzednim zamknieciem',
  !/<>\s*'closed'/i.test(sameEdition));
/* Ogłoszenie tego samego rocznika jest poprawką terminu, a nie nowym wydarzeniem. Kasowanie
   cudzych głosów przy poprawce godziny startu jest niedopuszczalne — zostają, a panel
   dowiaduje się o nich z `staleVotes`. */
check('0034 nie kasuje niczego w galezi "ta sama edycja"', !/delete from/i.test(sameEdition));
check('0034 oddaje slad po zostawionych glosach', /'staleVotes'/.test(roll));
check('0034 mowi panelowi, ze harmonogram wrocil', /'scheduleReset', true/.test(roll));

/* --- wynik -------------------------------------------------------------- */

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  const mark = pass ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${label}${extra ? `  (${extra})` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) {
  console.log('\nUWAGA: to jest analiza tekstu, nie uruchomienie SQL.');
  console.log('Przed wdrozeniem migracje musza przejsc `supabase db reset` na lokalnej bazie.');
  process.exit(1);
}
