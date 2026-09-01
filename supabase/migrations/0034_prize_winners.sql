/* ============================================================================
   Zwycięzcy dwunastu nagród, powrót harmonogramu po ogłoszeniu i ogłoszenie
   dla DRUGIEJ listy adresów
   ============================================================================
   Trzy sprawy w jednej migracji, bo wszystkie trzy dotyczą tego samego momentu w roku:
   chwili, w której organizator ogłasza nowy termin, a poprzedni rocznik ma po sobie
   zostawić wynik, a nie zamkniętą stronę i puste archiwum.

   ----------------------------------------------------------------------------
   1. PO CO `prize_winners` — dziś nie ma GDZIE zapisać werdyktu jury
   ----------------------------------------------------------------------------
   Sprawdzone kolumna po kolumnie, nie założone:

     `votes.category`          to stała `public-choice` (migracja 0026) — JEDNA nagroda
                               publiczności, nie dwanaście kategorii jury,
     `participants.category`   to kategoria STARTOWA pojazdu, czyli w czym jedzie, a nie co
                               wygrał,
     `voting_editions.results` to migawka JEDNEGO rankingu publiczności: agregaty głosów,
                               bez śladu decyzji organizatora.

   Werdykt jury nie miał więc w tej bazie żadnego miejsca — panel go pokazywał, a strona
   miała dwanaście kategorii wpisanych w kod. Ta tabela jest tym miejscem.

   ----------------------------------------------------------------------------
   2. DLACZEGO NAGRODA JEST IDENTYFIKOWANA KLUCZEM `prize-N`, A NIE NAZWĄ
   ----------------------------------------------------------------------------
   Nazwy nagród są tłumaczone na sześć języków (`assets/js/i18n.js`, sekcja „Dodici modi per
   vincere") i zmieniają się co rok — nagroda 03 ma rocznik wprost w nazwie. Nazwa jako klucz
   znaczyłaby więc, że:

     * ten sam werdykt ma sześć różnych identyfikatorów, po jednym na język,
     * zmiana roku w nazwie zrywa powiązanie z werdyktem z poprzedniej edycji,
     * literówka w tłumaczeniu tworzy trzynastą nagrodę, której nikt nie zauważy.

   `prize-1` … `prize-12` to identyfikator, którego nikt nie tłumaczy i nikt nie poprawia.
   Napis widoczny dla człowieka składa strona, z tego samego słownika, z którego składa całą
   sekcję nagród. Baza trzyma klucz, warstwa prezentacji trzyma nazwę.

   ----------------------------------------------------------------------------
   3. DLACZEGO `participant_id` MOŻE BYĆ NULL
   ----------------------------------------------------------------------------
   Dwa niezależne powody, oba realne:

   a) ZWYCIĘZCY NIE MA NA LIŚCIE STARTOWEJ. Nagrody przyznaje jury i część z dwunastu
      kategorii nie dotyczy pojazdu z listy: bywa, że wygrywa grupa kibiców, szkoła albo
      ktoś dopisany w dniu zawodów, zanim wpis w `participants` powstał. Wtedy wpisuje się
      `winner_label` ręcznie i to jest pełnoprawny werdykt, nie brak danych.

   b) ROLLOVER KASUJE UCZESTNIKÓW. `rollover_voting_edition` (migracja 0030) robi
      `delete from public.participants`. Klucz obcy `on delete cascade` skasowałby razem z
      nimi werdykt, a `on delete restrict` zablokowałby przejście na nowy rocznik do czasu,
      aż ktoś ręcznie usunie archiwum. Oba nie do przyjęcia — więc `on delete set null`:
      wskazanie na uczestnika traci sens dopiero wtedy, gdy tego uczestnika nie ma, a wiersz
      werdyktu zostaje.

   Z (b) wynika rzecz, o której nie wolno zapomnieć: SAMA TA TABELA NIE JEST ARCHIWUM.
   Po rolloverze `participant_id` jest już `null`, a numer startowy i imię żyły w
   `participants`. Dlatego werdykt jest MROŻONY w `voting_editions.prizes` w tej samej
   transakcji, w której mrożony jest `results` — tak samo i z tego samego powodu. Bez tego
   wynik nagród ginie razem z uczestnikami przy `DELETE FROM participants`.

   ----------------------------------------------------------------------------
   4. CZEGO W TEJ TABELI NIE MA: `public-choice`
   ----------------------------------------------------------------------------
   Nagroda Publiczności NIE jest jednym z dwunastu kluczy i nie wolno jej tu wpisać. Ona
   WYNIKA z głosów: liczy ją widok `voting_ranking`, a `voting_editions.results` ją mrozi
   przy archiwizacji. Gdyby dała się wpisać tutaj, ta sama nagroda miałaby dwa źródła — a
   dwa źródła jednej nagrody to dwa różne podia, które kiedyś się rozjadą i nikt nie
   odpowie, które jest prawdziwe. Więz CHECK niżej wymienia dokładnie dwanaście wartości i
   ani jednej więcej.

   ----------------------------------------------------------------------------
   5. `reminder_subscribers.last_announcement_event`
   ----------------------------------------------------------------------------
   To naprawa błędu, nie nowa funkcja. Ogłoszenie nowej edycji czytało WYŁĄCZNIE
   `newsletter_subscribers`, do której wchodzi się jedną drogą: rejestracja zawodnika z
   zaznaczonym `newsConsent`. Ludzie, którzy kliknęli „Powiadom mnie za rok", trafiają do
   `reminder_subscribers` — czyli do tabeli, której ogłoszenie NIGDY nie czytało. Osoby,
   które WPROST o powiadomienie poprosiły, były jedynymi, które go nie dostawały.

   Worker czyta teraz obie listy, a znacznik idempotencji musi być per lista, bo per lista
   jest wiersz, który się oznacza. Kolumna jest dokładnym odpowiednikiem tej z 0029.
   Zgoda i status są respektowane osobno dla każdej tabeli: `reminder_subscribers` ma własne
   `status in ('active','unsubscribed')` (0002) i własny `unsubscribe_token` (też 0002), więc
   odsyłacz „nie chcę więcej powiadomień" działa dla listu wysłanego z każdej z dwóch list.

   ----------------------------------------------------------------------------
   UWAGA O INDEKSIE CZĘŚCIOWYM — BŁĄD 42P17
   ----------------------------------------------------------------------------
   Warunek indeksu MUSI być IMMUTABLE. `now()` w `where` odrzuca całą migrację błędem 42P17
   („functions in index predicate must be marked IMMUTABLE"), a gdyby nawet przeszedł, byłby
   kłamliwy: Postgres wylicza predykat RAZ, przy zakładaniu — patrz nagłówek
   `0033_site_visits.sql`. Dlatego predykat to `status = 'active'`, tak samo jak w 0029.

   ----------------------------------------------------------------------------
   POWTARZALNOŚĆ
   ----------------------------------------------------------------------------
   Cały plik da się puścić dwa razy. Tabela i indeksy przez `if not exists`, kolumny przez
   `add column if not exists`, funkcja przez `create or replace`, a KAŻDY więz przez „znajdź
   nazwę w `pg_constraint`, zdejmij, założ" — bo `alter table ... add constraint` nie ma
   `IF NOT EXISTS` i drugi przebieg kończyłby się `duplicate_object`. Nazwy więzów są
   SZUKANE W KATALOGU, a nie wpisane z pamięci: na cudzej instalacji Postgres mógł nadać
   inną i `drop constraint` wywaliłby całą migrację. Ten sam wzorzec co w 0016, 0018 i 0032.
   ========================================================================== */

create table if not exists public.prize_winners (
  id uuid primary key default gen_random_uuid(),

  /* Rocznik, do którego należy werdykt. TU klucz obcy jest na miejscu i musi być `cascade`:
     `voting_editions` nie jest kasowane przez rollover, a ręczne usunięcie rocznika ma
     zabrać ze sobą jego nagrody, żeby nie zostały sierotami bez roku. */
  edition_id uuid not null references public.voting_editions(id) on delete cascade,

  /* `prize-1` … `prize-12`. Lista wartości jest w więzie niżej, w jednym miejscu — patrz
     punkt 2 w nagłówku (dlaczego klucz, a nie nazwa). */
  prize_key text not null,

  /* Wskazanie na listę startową. Może być `null` — patrz punkt 3 w nagłówku. Klucz obcy z
     `on delete set null`, bo rollover kasuje `participants`, a werdykt ma to przeżyć. */
  participant_id uuid,

  /* Zwycięzca wpisany ręcznie, gdy nie ma go na liście startowej. Współistnieje z
     `participant_id`: gdy oba są podane, ręczny napis wygrywa przy wyświetlaniu, bo to
     świadoma poprawka organizatora (np. nazwa zespołu zamiast imienia kierowcy). */
  winner_label text,

  /* Wynik słowami organizatora: czas przejazdu, uwaga jury, cokolwiek. Dowolny tekst, bo
     jury nie mierzy dwunastu kategorii jedną jednostką. */
  note text,

  created_at timestamptz not null default now(),
  /* Ustawiane przez Workera przy każdym zapisie. Bez triggera świadomie: jedyną drogą do tej
     tabeli jest końcówka `voting-admin`, więc trigger pilnowałby czegoś, co i tak robi jeden
     handler — a byłby kolejnym obiektem do utrzymania i do zdjęcia przy `db reset`. */
  updated_at timestamptz not null default now()
);

/* --------------------------------------------------------------------- więzy */
do $$
begin
  /* Dwanaście wartości i ani jednej więcej. `public-choice` NIE JEST na liście — patrz
     punkt 4 w nagłówku. Więz zdejmowany i zakładany od nowa, bo `check` nie da się zmienić
     w miejscu, a lista mogła w poprzednim przebiegu wyglądać inaczej. */
  if exists (
    select 1 from pg_constraint
     where conname = 'prize_winners_prize_key_check'
       and conrelid = 'public.prize_winners'::regclass
  ) then
    alter table public.prize_winners drop constraint prize_winners_prize_key_check;
  end if;

  alter table public.prize_winners
    add constraint prize_winners_prize_key_check check (prize_key in (
      'prize-1', 'prize-2', 'prize-3', 'prize-4', 'prize-5', 'prize-6',
      'prize-7', 'prize-8', 'prize-9', 'prize-10', 'prize-11', 'prize-12'
    ));

  /* Jeden zwycięzca na nagrodę w danym roczniku. NAZWANY więz, nie goły indeks unikalny, bo
     PostgREST robi tu upsert i `ON CONFLICT` czyta więzy — bez tego drugi zapis tej samej
     nagrody wracałby jako 42P10 zamiast nadpisać poprzedni. Ten sam powód, co przy
     `reminder_subscribers_email_unique` w migracji 0010.

     Indeks tego więzu prowadzi po `edition_id`, więc obsługuje też jedyne pytanie, jakie
     zadaje strona — „wszystkie nagrody tego rocznika". Osobnego indeksu nie ma i nie ma go
     po co dokładać. */
  if not exists (
    select 1 from pg_constraint
     where conname = 'prize_winners_edition_prize_key'
       and conrelid = 'public.prize_winners'::regclass
  ) then
    alter table public.prize_winners
      add constraint prize_winners_edition_prize_key unique (edition_id, prize_key);
  end if;

  /* `on delete set null`, nie `cascade` i nie `restrict` — uzasadnienie w punkcie 3.
     Zakładany warunkowo, bo tabela mogła powstać we wcześniejszym przebiegu bez niego. */
  if not exists (
    select 1 from pg_constraint
     where conname = 'prize_winners_participant_fk'
       and conrelid = 'public.prize_winners'::regclass
  ) then
    alter table public.prize_winners
      add constraint prize_winners_participant_fk
      foreign key (participant_id) references public.participants(id) on delete set null;
  end if;
end;
$$;

comment on table public.prize_winners is
  'Werdykt organizatora dla dwunastu nagrod biezacego rocznika. Archiwum siedzi w voting_editions.prizes, nie tutaj.';
comment on column public.prize_winners.prize_key is
  'prize-1..prize-12. Klucz, nie nazwa: nazwy sa tlumaczone na szesc jezykow i zmieniaja sie co rok.';
comment on column public.prize_winners.participant_id is
  'Wskazanie na liste startowa. NULL, gdy zwyciezcy tam nie ma albo gdy rollover skasowal uczestnikow.';
comment on column public.prize_winners.winner_label is
  'Zwyciezca wpisany recznie. Wygrywa nad imieniem z listy startowej przy wyswietlaniu.';
comment on column public.prize_winners.note is
  'Wynik slowami organizatora: czas, uwaga jury, cokolwiek. Dowolny tekst.';

/* ------------------------------------------------------------------------ RLS
   Zapis i odczyt idą wyłącznie przez Workera z kluczem `service_role`. Anon nie ma tu nic do
   roboty w żadną stronę: nagrody wychodzą na stronę przez końcówkę `voting`, która sama
   pilnuje, co i kiedy pokazać. Bez RLS tabela z kluczem publicznym oddawałaby werdykt przed
   ogłoszeniem go na placu. */
alter table public.prize_winners enable row level security;
revoke all on public.prize_winners from anon, authenticated;
grant select, insert, update, delete on public.prize_winners to service_role;

/* ============================================================ archiwum nagród
   `voting_editions.prizes` — migawka werdyktu, dokładnie tak jak `results` jest migawką
   rankingu publiczności.

   PO CO OSOBNA KOLUMNA, A NIE ODCZYT PO `prize_winners`
     Bo po rolloverze nie ma czego odczytać: `participant_id` jest już `null` (kasacja
     uczestników + `on delete set null`), a numer startowy, nazwa wózka i imię zwycięzcy żyły
     w `participants`. Odczyt archiwum po żywych tabelach oddawałby dwanaście pustych
     kategorii. Ta kolumna trzyma to, co było prawdą w chwili archiwizacji, i nie zależy od
     niczego, co można później skasować. To ten sam wzorzec i ten sam powód, co `results`. */
alter table public.voting_editions
  add column if not exists prizes jsonb not null default '[]'::jsonb;

do $$
begin
  /* Tablica, nie obiekt i nie `null`. Bez tego więzu jeden zły zapis zamienia archiwum
     nagród w wartość, po której Worker nie umie przejść pętlą — a objawia się to dopiero
     przy oglądaniu archiwum, czyli miesiące po tym, jak zapis się wykonał. Ten sam więz,
     co przy `results` w 0030. */
  if exists (
    select 1 from pg_constraint
     where conname = 'voting_editions_prizes_array_check'
       and conrelid = 'public.voting_editions'::regclass
  ) then
    alter table public.voting_editions drop constraint voting_editions_prizes_array_check;
  end if;

  alter table public.voting_editions
    add constraint voting_editions_prizes_array_check check (jsonb_typeof(prizes) = 'array');
end;
$$;

comment on column public.voting_editions.prizes is
  'Zamrozony werdykt dwunastu nagrod tego rocznika. Powstaje w rollover_voting_edition, przed DELETE FROM participants.';

/* ============================== ogłoszenie także dla listy przypomnień
   Odpowiednik kolumny z 0029, tam dla `newsletter_subscribers`. Znacznik idempotencji musi
   istnieć w KAŻDEJ tabeli, z której czyta kolejka listów, bo oznacza się wiersz — jedna
   wspólna kolumna gdzie indziej nie miałaby czego oznaczyć. */
alter table public.reminder_subscribers
  add column if not exists last_announcement_event text;

comment on column public.reminder_subscribers.last_announcement_event is
  'ISO event timestamp ostatniego ogloszenia edycji zakolejkowanego dla tego adresu. Odpowiednik kolumny z 0029.';

/* Predykat ze stałą, bez `now()` — patrz uwaga o 42P17 w nagłówku. Ten indeks obsługuje
   dokładnie to zapytanie, które robi kolejka: aktywni, najstarsi pierwsi. */
create index if not exists reminder_announcement_pending_idx
  on public.reminder_subscribers (created_at)
  where status = 'active';

/* ============================================================================
   `rollover_voting_edition` — nowa wersja, dwie zmiany i ani jednej więcej
   ============================================================================
   Cała funkcja przepisana przez `create or replace`, bo w PL/pgSQL nie da się podmienić
   fragmentu ciała. KOLEJNOŚĆ OPERACJI JEST NIETKNIĘTA: blokada `pg_advisory_xact_lock`
   pierwsza, potem wszystkie kontrole (`INVALID_EDITION`, `EDITION_ALREADY_EXISTS`,
   `ACTIVE_EDITION_MISSING`, `VOTING_EDITION_NOT_CLOSED`), potem przepisanie zgód na wynik i
   oba snapshoty — wszystko PRZED oboma `DELETE`. To nie jest kwestia stylu: warunek
   sprawdzony po `DELETE` jest sprawdzaniem, czy wolno było zrobić to, co już się stało.

   ZMIANA 1 — werdykt nagród zamrażany razem z rankingiem
   ---------------------------------------------------------------------------
   `archived_prizes` liczone z `prize_winners` ZŁĄCZONEGO z `participants`, PRZED kasacją
   uczestników. Po kasacji te same wiersze oddałyby dwanaście pozycji bez numerów startowych
   i bez nazwisk, bo tożsamość zwycięzcy z listy startowej mieszka w `participants`, a nie w
   werdykcie. Kolejność w migawce jest po liczbie w kluczu, nie po tekście: sortowanie
   tekstowe ustawia `prize-10` przed `prize-2`, czyli oddaje archiwum w kolejności, której
   nikt nie zamawiał.

   Nagrody Publiczności w tej migawce NIE MA i nie ma jej po co szukać — ona jest w
   `results`, policzona z głosów. Patrz punkt 4 w nagłówku pliku.

   ZMIANA 2 — harmonogram wraca ZAWSZE, także gdy edycja była zamknięta
   ---------------------------------------------------------------------------
   TO JEST NAPRAWA „PRZYCISKI NA STRONIE NIE WRACAJĄ DO STANU POCZĄTKOWEGO".

   Stary warunek w gałęzi „ta sama edycja" brzmiał:

       if votes_total = 0 and coalesce(voting_state.status, 'scheduled') <> 'closed'

   czyli harmonogram NIE był resetowany, gdy poprzedni sezon zostawił `status = 'closed'`
   albo gdy w bazie były jeszcze głosy. Skutek na stronie: organizator ogłasza nowy termin w
   tym samym roczniku, a `voting_settings.status` zostaje `closed`. `votingPhase()` w Workerze
   sprawdza `status = 'closed'` PIERWSZE i wygrywa ono ze wszystkim, więc żadna zmiana daty
   tego nie odblokowywała — „Zapisz się" i „Będę tam" zostawały wygaszone, a strona dalej
   pokazywała zamkniętą edycję z zablokowanym formularzem.

   Teraz ogłoszenie terminu ZAWSZE przestawia `voting_settings` na `scheduled` z nowym
   `race_starts_at` i wyliczonym `voting_ends_at`. Ogłoszenie terminu jest deklaracją „to
   wydarzenie jest przed nami" i strona ma wyglądać dokładnie tak.

   CO Z GŁOSAMI W GAŁĘZI „TA SAMA EDYCJA" — DECYZJA ŚWIADOMA
   ---------------------------------------------------------------------------
   Ta gałąź NIE KASUJE ANI JEDNEGO GŁOSU. Ani `votes`, ani `participants`, ani `prize_winners`.

   Dlaczego nie kasuje: rollover w obrębie tego samego rocznika nie jest nowym wydarzeniem,
   tylko poprawką jego terminu, nazwy albo miejsca. Kasowanie przy poprawce daty znaczyłoby,
   że literówka w godzinie startu usuwa wynik głosowania publiczności — bez pytania, bez
   śladu i bez sposobu na odwrócenie. Cudze głosy usuwa się jedną drogą: świadomym
   „wyczyść głosy" w panelu (`voting-admin` / `clear`), z ręką organizatora na przycisku.

   Dlaczego brak kasowania jest bezpieczny mimo powrotu do `scheduled`: głosy zostają
   policzalne, `voting_ranking` liczy je dalej, a `results` archiwizowanej edycji powstaje z
   nich przy prawdziwym przejściu na następny rocznik. Nic nie ginie — chowa się tylko podium
   na stronie, bo podium pokazuje się przy fazie `closed`, a faza jest teraz `scheduled`. To
   jest dokładnie to, o co prosi organizator, ogłaszając nowy termin.

   Czego to nie ukrywa: głosy z poprzedniego przebiegu wchodzą do nowego okna głosowania i
   sumują się z nowymi, a ludzie, którzy już zagłosowali, drugi raz nie zagłosują (indeks
   unikalny po adresie i po urządzeniu). Dlatego funkcja ODDAJE `staleVotes` — panel ma czym
   powiedzieć „w tym roczniku jest już N głosów z wcześniejszego przebiegu, wyczyść je, jeśli
   to nowe głosowanie" zamiast pokazywać sam sukces. Cicha kasacja i ciche mieszanie głosów
   są oba złe; jedno z nich da się naprawić jednym klikiem, drugiego nie da się naprawić
   wcale, i dlatego wybrane jest to pierwsze.

   ZABEZPIECZENIA NIETKNIĘTE
     `VOTING_EDITION_NOT_CLOSED` — dalej broni ŚCIEŻKI ARCHIWIZACJI, czyli jedynego miejsca,
       w którym wynik jest zamrażany. Gałąź „ta sama edycja" nic nie zamraża i nic nie kasuje,
       więc nie ma tam niedokończonego wyniku, który dałoby się zamrozić.
     `EDITION_ALREADY_EXISTS`, `ACTIVE_EDITION_MISSING`, `INVALID_EDITION` — bez zmian.
     `pg_advisory_xact_lock` — pierwsza instrukcja funkcji, bez zmian.
     Snapshot `results` (i teraz `prizes`) przed `DELETE` — bez zmian.
     Przepisanie zgód na powiadomienie o wyniku przed `DELETE` — bez zmian. (Ciąg
       `PENDING_RESULT_NOTIFICATIONS`, który Worker mapuje na kod 409, w tej funkcji nigdy nie
       był podnoszony — mapowanie zostaje nietknięte, ale niczego takiego nie ma tu do zdjęcia.)
   ========================================================================== */
create or replace function public.rollover_voting_edition(
  p_event_name text,
  p_event_date timestamptz,
  p_event_location text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_edition public.voting_editions%rowtype;
  new_edition public.voting_editions%rowtype;
  voting_state public.voting_settings%rowtype;
  archived_results jsonb := '[]'::jsonb;
  archived_prizes jsonb := '[]'::jsonb;
  participants_total integer := 0;
  votes_total integer := 0;
  next_key text;
  duration integer := 30;
begin
  perform pg_advisory_xact_lock(hashtext('carruleddhi-voting-rollover'));
  if p_event_date is null or btrim(coalesce(p_event_name, '')) = ''
     or btrim(coalesce(p_event_location, '')) = '' then
    raise exception 'INVALID_EDITION';
  end if;

  select * into current_edition
    from public.voting_editions where status = 'active' for update;
  select * into voting_state
    from public.voting_settings where id is true for update;

  next_key := to_char(p_event_date at time zone 'Europe/Rome', 'YYYY');
  duration := coalesce(voting_state.duration_minutes, 30);
  select count(*)::integer into participants_total from public.participants where active;
  select count(*)::integer into votes_total from public.votes where category = 'public-choice';

  /* The year is the public archive key. Changing the date/name inside that same annual
     edition updates it in place instead of creating a duplicate or deleting live data. */
  if current_edition.id is not null and current_edition.edition_key = next_key then
    update public.voting_editions set
      event_name = btrim(p_event_name),
      event_date = p_event_date,
      event_location = btrim(p_event_location)
    where id = current_edition.id
    returning * into current_edition;

    /* BEZWARUNKOWO. Ogłoszenie terminu jest deklaracją „to wydarzenie jest przed nami", więc
       strona musi wrócić do odliczania i odblokować zapisy — patrz ZMIANA 2. Głosy zostają
       nietknięte i wracają w `staleVotes`. */
    insert into public.voting_settings (
      id, status, race_starts_at, voting_started_at, voting_ends_at, duration_minutes
    ) values (
      true, 'scheduled', p_event_date, null,
      p_event_date + make_interval(mins => duration), duration
    ) on conflict (id) do update set
      status = 'scheduled', race_starts_at = excluded.race_starts_at,
      voting_started_at = null, voting_ends_at = excluded.voting_ends_at;

    return jsonb_build_object(
      'rolledOver', false, 'alreadyApplied', true,
      'activeEditionId', current_edition.id,
      'activeEditionKey', current_edition.edition_key,
      'participantCount', participants_total, 'voteCount', votes_total,
      /* Harmonogram wrócił do odliczania — zawsze, w tej gałęzi też. */
      'scheduleReset', true,
      /* Głosy z wcześniejszego przebiegu tego samego rocznika. Zero znaczy „czysto".
         Cokolwiek innego jest zdaniem dla organizatora, nie błędem. */
      'staleVotes', votes_total
    );
  end if;

  if exists (select 1 from public.voting_editions where edition_key = next_key) then
    raise exception 'EDITION_ALREADY_EXISTS';
  end if;

  if current_edition.id is null and (participants_total > 0 or votes_total > 0) then
    raise exception 'ACTIVE_EDITION_MISSING';
  end if;

  /* Never freeze a partial live result. A naturally elapsed end time is equivalent to the
     explicit closed switch used by the admin. */
  if (participants_total > 0 or votes_total > 0)
     and not (
       voting_state.status = 'closed'
       or (voting_state.voting_ends_at is not null and voting_state.voting_ends_at <= now())
     ) then
    raise exception 'VOTING_EDITION_NOT_CLOSED';
  end if;

  /* Preserve private opt-ins transactionally before live votes are deleted. The hourly
     outbox reads this table and marks each accepted message independently. */
  if current_edition.id is not null then
    insert into public.voting_result_notifications (
      edition_id, vote_id, voter_name, voter_email, voter_locale
    )
    select current_edition.id, id, voter_name, voter_email, voter_locale
      from public.votes
      where category = 'public-choice' and notify_results
        and voter_email is not null and result_notified_at is null
    on conflict (edition_id, vote_id) do nothing;
  end if;

  /* Podzapytanie, nie CTE.
     `WITH ... SELECT ... INTO zmienna` w PL/pgSQL jest konstrukcją, o której poprawność da się
     spierać i której nie zweryfikuję bez uruchomionego Postgresa. Zwykłe podzapytanie w FROM
     robi dokładnie to samo i nie zostawia wątpliwości — a ta funkcja usuwa niżej wszystkie
     głosy, więc nie jest miejscem na konstrukcję „chyba działa". */
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'category', category, 'startNumber', start_number,
      'firstName', first_name, 'lastName', last_name,
      'projectName', coalesce(project_name, ''), 'imagePath', coalesce(image_path, ''),
      'voteCount', vote_count, 'averageScore', average_score,
      'totalScore', total_score, 'place', case when vote_count > 0 then place else null end
    ) order by place), '[]'::jsonb)
  into archived_results
  from (
    select
      p.id, p.category, p.start_number, p.first_name, p.last_name,
      p.project_name, p.image_path,
      count(v.id)::integer as vote_count,
      round(coalesce(avg(v.score), 0)::numeric, 2) as average_score,
      coalesce(sum(v.score), 0)::integer as total_score,
      row_number() over (
        order by coalesce(sum(v.score), 0) desc, count(v.id) desc,
                 coalesce(avg(v.score), 0) desc, p.start_number asc
      )::integer as place
    from public.participants p
    left join public.votes v
      on v.participant_id = p.id and v.category = 'public-choice'
    where p.active
    group by p.id, p.category, p.start_number, p.first_name, p.last_name,
             p.project_name, p.image_path
  ) as ranked;

  /* WERDYKT NAGRÓD, ZAMROŻONY PRZED KASACJĄ UCZESTNIKÓW — patrz ZMIANA 1.
     Kolejność po liczbie w kluczu (`prize-2` przed `prize-10`), nazwa zwycięzcy z ręcznego
     napisu, a gdy go nie ma — z imienia i nazwiska z listy startowej. Kształt jest DOKŁADNIE
     tym, co Worker oddaje na stronę, żeby archiwum i edycja trwająca miały jedną postać. */
  if current_edition.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'prizeKey', prize_key,
        'startNumber', start_number,
        'projectName', project_name,
        'riderName', rider_name,
        'note', note
      ) order by prize_order), '[]'::jsonb)
    into archived_prizes
    from (
      select
        w.prize_key,
        coalesce(p.start_number, 0) as start_number,
        coalesce(p.project_name, '') as project_name,
        coalesce(
          nullif(btrim(coalesce(w.winner_label, '')), ''),
          nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
          ''
        ) as rider_name,
        coalesce(w.note, '') as note,
        coalesce(nullif(regexp_replace(w.prize_key, '[^0-9]', '', 'g'), ''), '0')::integer
          as prize_order
      from public.prize_winners w
      left join public.participants p on p.id = w.participant_id
      where w.edition_id = current_edition.id
    ) as decided;
  end if;

  if current_edition.id is not null then
    update public.voting_editions set
      status = 'archived', results = archived_results,
      /* Werdykt jury obok rankingu publiczności. Dwie migawki, dwa źródła, jedna
         transakcja — i obie sporządzone przed `DELETE`. */
      prizes = archived_prizes,
      participant_count = participants_total, vote_count = votes_total,
      archived_at = now()
    where id = current_edition.id;
  end if;

  /* Snapshot and every safety check above are in this transaction, before either DELETE. */
  delete from public.votes;
  delete from public.participants;

  insert into public.voting_editions
    (edition_key, event_name, event_date, event_location, status)
  values
    (next_key, btrim(p_event_name), p_event_date, btrim(p_event_location), 'active')
  returning * into new_edition;

  insert into public.voting_settings (
    id, status, race_starts_at, voting_started_at, voting_ends_at, duration_minutes
  ) values (
    true, 'scheduled', p_event_date, null,
    p_event_date + make_interval(mins => duration), duration
  ) on conflict (id) do update set
    status = 'scheduled', race_starts_at = excluded.race_starts_at,
    voting_started_at = null, voting_ends_at = excluded.voting_ends_at;

  return jsonb_build_object(
    'rolledOver', true, 'alreadyApplied', false,
    'archivedEditionId', current_edition.id,
    'archivedEditionKey', current_edition.edition_key,
    'activeEditionId', new_edition.id, 'activeEditionKey', new_edition.edition_key,
    'participantCount', participants_total, 'voteCount', votes_total,
    /* Ile nagród weszło do archiwum. Zero znaczy „jury nie wpisało nic" i jest informacją,
       nie błędem — nowy rocznik startuje z pustą dwunastką. */
    'prizeCount', jsonb_array_length(archived_prizes),
    /* Nowy rocznik zawsze wraca do odliczania — ta gałąź zakłada świeży harmonogram. */
    'scheduleReset', true,
    /* Nowy rocznik startuje bez głosów, bo głosy poprzedniego właśnie poszły do archiwum. */
    'staleVotes', 0
  );
end;
$$;

comment on function public.rollover_voting_edition(text, timestamptz, text) is
  'Idempotentnie archiwizuje zamknieta edycje (ranking i werdykt nagrod) i przygotowuje czysty rocznik w stanie scheduled.';

/* `create or replace` zachowuje uprawnienia, ale powtórzenie ich tutaj nie kosztuje nic i
   domyka plik: po tej migracji stan uprawnień jest widoczny w niej samej, a nie tylko w 0030. */
revoke execute on function public.rollover_voting_edition(text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.rollover_voting_edition(text, timestamptz, text) to service_role;
