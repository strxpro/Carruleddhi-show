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

/* --- kolumny, na których stoją nowe migracje ----------------------------- */

/* Wszystkie migracje razem: nowa nie może opierać się na kolumnie, której nikt nie tworzy.
   To jest ten błąd, który na produkcji objawia się jako 400 z PostgREST w dniu zawodów. */
const everything = files.map((name) => code(read(name))).join('\n');

for (const column of [
  'duration_minutes', 'race_starts_at', 'voting_started_at', 'voting_ends_at',
  'participant_id', 'device_id', 'edit_token', 'image_path', 'registration_id', 'start_number'
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
